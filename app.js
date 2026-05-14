// 토론 발언 타이머 — vanilla JS, no deps
(() => {
  "use strict";

  const STORAGE_KEY = "toron-timer.settings.v1";
  const WARN_RATIO = 0.8; // 80% of per-speaker limit

  // ---------- State ----------
  const state = {
    pro: { name: "찬성", elapsedMs: 0, count: 0, currentStartMs: null },
    con: { name: "반대", elapsedMs: 0, count: 0, currentStartMs: null },
    active: null,        // "pro" | "con" | null
    running: false,
    perSpeakerLimitMs: 120000, // 2 minutes default
    muted: false,
    topic: "",
    notifiedWarn: false,
    notifiedCritical: false,
  };

  // ---------- DOM refs ----------
  const $ = (id) => document.getElementById(id);
  const els = {
    topicInput: $("topic-input"),
    btnMute: $("btn-mute"),
    btnSettings: $("btn-settings"),
    btnFullscreen: $("btn-fullscreen"),
    btnToggle: $("btn-toggle"),
    btnToggleLabel: $("btn-toggle-label"),
    btnActivePro: $("btn-active-pro"),
    btnActiveCon: $("btn-active-con"),
    btnReset: $("btn-reset"),
    proPanel: $("pro-panel"),
    conPanel: $("con-panel"),
    proName: $("pro-name"),
    conName: $("con-name"),
    proCum: $("pro-cum"),
    conCum: $("con-cum"),
    proCount: $("pro-count"),
    conCount: $("con-count"),
    proNow: $("pro-now"),
    conNow: $("con-now"),
    balancePro: $("balance-pro"),
    balanceCon: $("balance-con"),
    balanceReadout: $("balance-readout"),
    settingsModal: $("settings-modal"),
    proNameInput: $("pro-name-input"),
    conNameInput: $("con-name-input"),
    limitMin: $("limit-min"),
    limitSec: $("limit-sec"),
    mutedInput: $("muted-input"),
    settingsCancel: $("settings-cancel"),
    settingsSave: $("settings-save"),
    resetModal: $("reset-modal"),
    resetCancel: $("reset-cancel"),
    resetConfirm: $("reset-confirm"),
    toast: $("toast"),
  };

  // ---------- Persistence ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.proName === "string" && parsed.proName.trim()) state.pro.name = parsed.proName;
      if (typeof parsed.conName === "string" && parsed.conName.trim()) state.con.name = parsed.conName;
      if (Number.isFinite(parsed.perSpeakerLimitMs) && parsed.perSpeakerLimitMs >= 0) {
        state.perSpeakerLimitMs = parsed.perSpeakerLimitMs;
      }
      if (typeof parsed.muted === "boolean") state.muted = parsed.muted;
      if (typeof parsed.topic === "string") state.topic = parsed.topic;
    } catch (err) {
      console.warn("Failed to load settings:", err);
    }
  }

  function saveSettings() {
    try {
      const payload = {
        proName: state.pro.name,
        conName: state.con.name,
        perSpeakerLimitMs: state.perSpeakerLimitMs,
        muted: state.muted,
        topic: state.topic,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.warn("Failed to save settings:", err);
    }
  }

  // ---------- Audio ----------
  let audioCtx = null;
  function ensureAudio() {
    if (state.muted) return null;
    if (!audioCtx) {
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        audioCtx = new Ctor();
      } catch (err) {
        console.warn("AudioContext init failed:", err);
        return null;
      }
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function beep(freq, durationMs, gain = 0.18) {
    const ctx = ensureAudio();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gainNode.gain.value = 0;
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      const now = ctx.currentTime;
      gainNode.gain.linearRampToValueAtTime(gain, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, now + durationMs / 1000);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
    } catch (err) {
      console.warn("beep failed:", err);
    }
  }

  function beepStart() { beep(880, 140); }
  function beepStop()  { beep(440, 140); }
  function beepWarn()  { beep(660, 90, 0.14); }
  function beepCritical() {
    beep(880, 220, 0.22);
    setTimeout(() => beep(880, 220, 0.22), 260);
  }

  // ---------- Time helpers ----------
  function now() { return performance.now(); }

  function formatCum(ms) {
    const totalSec = Math.max(0, ms) / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    const tenths = Math.floor((totalSec * 10) % 10);
    return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
  }

  function formatShort(ms) {
    const totalSec = Math.max(0, ms) / 1000;
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function teamCurrentMs(team) {
    if (team.currentStartMs == null) return 0;
    return now() - team.currentStartMs;
  }

  function teamTotalMs(team) {
    return team.elapsedMs + teamCurrentMs(team);
  }

  // ---------- Core controls ----------
  function startActive() {
    if (!state.active) return;
    if (state.running) return;
    const team = state[state.active];
    team.currentStartMs = now();
    team.count += 1;
    state.running = true;
    state.notifiedWarn = false;
    state.notifiedCritical = false;
    beepStart();
    render();
  }

  function stopActive() {
    if (!state.running || !state.active) return;
    const team = state[state.active];
    team.elapsedMs += teamCurrentMs(team);
    team.currentStartMs = null;
    state.running = false;
    state.notifiedWarn = false;
    state.notifiedCritical = false;
    beepStop();
    render();
  }

  function toggleActive() {
    if (state.running) stopActive();
    else if (state.active) startActive();
    else {
      // No team selected yet — default to pro
      state.active = "pro";
      startActive();
    }
  }

  function setActiveTeam(side) {
    if (state.running) {
      // Stop current speaker first
      stopActive();
    }
    state.active = side;
    startActive();
  }

  function resetAll() {
    state.pro.elapsedMs = 0;
    state.pro.count = 0;
    state.pro.currentStartMs = null;
    state.con.elapsedMs = 0;
    state.con.count = 0;
    state.con.currentStartMs = null;
    state.active = null;
    state.running = false;
    state.notifiedWarn = false;
    state.notifiedCritical = false;
    render();
    showToast("리셋되었습니다.");
  }

  // ---------- Rendering ----------
  function panelState(side) {
    // Both panels go idle whenever nothing is running.
    if (!state.running || state.active !== side) return "idle";
    const limit = state.perSpeakerLimitMs;
    if (limit <= 0) return "active";
    const curMs = teamCurrentMs(state[side]);
    if (curMs >= limit) return "critical";
    if (curMs >= limit * WARN_RATIO) return "warn";
    return "active";
  }

  function render() {
    // Names
    els.proName.textContent = state.pro.name || "찬성";
    els.conName.textContent = state.con.name || "반대";

    // Cumulative & current
    els.proCum.textContent = formatCum(teamTotalMs(state.pro));
    els.conCum.textContent = formatCum(teamTotalMs(state.con));
    els.proCount.textContent = String(state.pro.count);
    els.conCount.textContent = String(state.con.count);

    const proIsRunning = state.running && state.active === "pro";
    const conIsRunning = state.running && state.active === "con";
    els.proNow.textContent = proIsRunning ? formatShort(teamCurrentMs(state.pro)) : "—";
    els.conNow.textContent = conIsRunning ? formatShort(teamCurrentMs(state.con)) : "—";

    // Panel states
    els.proPanel.setAttribute("data-state", panelState("pro"));
    els.conPanel.setAttribute("data-state", panelState("con"));

    // Aria labels reflect intent
    els.proPanel.setAttribute(
      "aria-label",
      proIsRunning ? `${state.pro.name} 발언 중 — 클릭하면 정지` : `${state.pro.name} 활성 + 시작`
    );
    els.conPanel.setAttribute(
      "aria-label",
      conIsRunning ? `${state.con.name} 발언 중 — 클릭하면 정지` : `${state.con.name} 활성 + 시작`
    );

    // Toggle button label/state
    if (state.running) {
      els.btnToggleLabel.textContent = "정지";
      els.btnToggle.classList.add("is-running");
    } else {
      els.btnToggleLabel.textContent = state.active ? "시작" : "시작";
      els.btnToggle.classList.remove("is-running");
    }

    // Mute button
    els.btnMute.setAttribute("aria-pressed", state.muted ? "true" : "false");
    els.btnMute.setAttribute("aria-label", state.muted ? "음소거 끄기" : "음소거 켜기");

    // Balance bar
    const proTotal = teamTotalMs(state.pro);
    const conTotal = teamTotalMs(state.con);
    const sum = proTotal + conTotal;
    if (sum <= 50) {
      els.balancePro.style.flexGrow = "1";
      els.balanceCon.style.flexGrow = "1";
      els.balanceReadout.textContent = "균형 50% / 50%";
    } else {
      const proPct = (proTotal / sum) * 100;
      const conPct = 100 - proPct;
      els.balancePro.style.flexGrow = String(Math.max(0.001, proTotal));
      els.balanceCon.style.flexGrow = String(Math.max(0.001, conTotal));
      els.balanceReadout.textContent =
        `${state.pro.name} ${proPct.toFixed(0)}% / ${conPct.toFixed(0)}% ${state.con.name}`;
    }
  }

  // ---------- Tick loop ----------
  let rafHandle = null;
  function tick() {
    if (state.running && state.active) {
      const team = state[state.active];
      const curMs = teamCurrentMs(team);
      const limit = state.perSpeakerLimitMs;
      if (limit > 0) {
        if (!state.notifiedCritical && curMs >= limit) {
          state.notifiedCritical = true;
          beepCritical();
        } else if (!state.notifiedWarn && curMs >= limit * WARN_RATIO && curMs < limit) {
          state.notifiedWarn = true;
          beepWarn();
        }
      }
      render();
    }
    rafHandle = requestAnimationFrame(tick);
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    requestAnimationFrame(() => els.toast.classList.add("is-visible"));
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove("is-visible");
      setTimeout(() => { els.toast.hidden = true; }, 240);
    }, 1700);
  }

  // ---------- Modals ----------
  function openSettings() {
    els.proNameInput.value = state.pro.name;
    els.conNameInput.value = state.con.name;
    const totalSec = Math.round(state.perSpeakerLimitMs / 1000);
    els.limitMin.value = String(Math.floor(totalSec / 60));
    els.limitSec.value = String(totalSec % 60);
    els.mutedInput.checked = state.muted;
    els.settingsModal.hidden = false;
    setTimeout(() => els.proNameInput.focus(), 0);
  }

  function closeSettings() {
    els.settingsModal.hidden = true;
  }

  function saveSettingsModal() {
    const proName = (els.proNameInput.value || "").trim() || "찬성";
    const conName = (els.conNameInput.value || "").trim() || "반대";
    const mins = clampInt(els.limitMin.value, 0, 30);
    const secs = clampInt(els.limitSec.value, 0, 59);
    const limitMs = (mins * 60 + secs) * 1000;
    state.pro.name = proName;
    state.con.name = conName;
    state.perSpeakerLimitMs = limitMs;
    state.muted = !!els.mutedInput.checked;
    saveSettings();
    closeSettings();
    render();
    showToast("설정이 저장되었습니다.");
  }

  function clampInt(v, min, max) {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function openResetConfirm() {
    els.resetModal.hidden = false;
    setTimeout(() => els.resetConfirm.focus(), 0);
  }
  function closeResetConfirm() {
    els.resetModal.hidden = true;
  }

  // ---------- Fullscreen ----------
  function toggleFullscreen() {
    const doc = document;
    const el = document.documentElement;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (!isFs) {
      (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el)
        ?.catch?.(() => showToast("풀스크린 사용 불가"));
    } else {
      (doc.exitFullscreen || doc.webkitExitFullscreen || (() => {})).call(doc);
    }
  }

  // ---------- Event wiring ----------
  function isTypingTarget(t) {
    if (!t) return false;
    const tag = t.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
  }

  function isModalOpen() {
    return !els.settingsModal.hidden || !els.resetModal.hidden;
  }

  function onKeyDown(e) {
    // Esc handles modals regardless of focus
    if (e.key === "Escape") {
      if (!els.settingsModal.hidden) { closeSettings(); e.preventDefault(); return; }
      if (!els.resetModal.hidden) { closeResetConfirm(); e.preventDefault(); return; }
    }

    if (isModalOpen()) {
      // Inside modal: allow Enter on confirm button if reset modal
      if (e.key === "Enter" && !els.resetModal.hidden && document.activeElement !== els.resetCancel) {
        e.preventDefault();
        resetAll();
        closeResetConfirm();
      }
      return;
    }

    if (isTypingTarget(e.target)) return;

    const k = e.key;
    if (k === " " || k === "Spacebar") {
      e.preventDefault();
      toggleActive();
    } else if (k === "a" || k === "A" || k === "ㅁ") {
      e.preventDefault();
      setActiveTeam("pro");
    } else if (k === "l" || k === "L" || k === "ㅣ") {
      e.preventDefault();
      setActiveTeam("con");
    } else if (k === "f" || k === "F" || k === "ㄹ") {
      e.preventDefault();
      toggleFullscreen();
    } else if (k === "m" || k === "M" || k === "ㅡ") {
      e.preventDefault();
      state.muted = !state.muted;
      saveSettings();
      render();
      showToast(state.muted ? "음소거 켜짐" : "음소거 꺼짐");
    } else if (k === "r" || k === "R" || k === "ㄱ") {
      e.preventDefault();
      openResetConfirm();
    }
  }

  function wireEvents() {
    document.addEventListener("keydown", onKeyDown);

    els.btnToggle.addEventListener("click", () => toggleActive());
    els.btnActivePro.addEventListener("click", () => setActiveTeam("pro"));
    els.btnActiveCon.addEventListener("click", () => setActiveTeam("con"));
    els.btnReset.addEventListener("click", () => openResetConfirm());
    els.btnFullscreen.addEventListener("click", () => toggleFullscreen());
    els.btnSettings.addEventListener("click", () => openSettings());
    els.btnMute.addEventListener("click", () => {
      state.muted = !state.muted;
      saveSettings();
      render();
      showToast(state.muted ? "음소거 켜짐" : "음소거 꺼짐");
    });

    els.proPanel.addEventListener("click", () => {
      if (state.running && state.active === "pro") stopActive();
      else setActiveTeam("pro");
    });
    els.conPanel.addEventListener("click", () => {
      if (state.running && state.active === "con") stopActive();
      else setActiveTeam("con");
    });
    [els.proPanel, els.conPanel].forEach((panel) => {
      panel.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          panel.click();
        }
      });
    });

    els.topicInput.addEventListener("input", () => {
      state.topic = els.topicInput.value;
      saveSettings();
    });

    els.settingsCancel.addEventListener("click", closeSettings);
    els.settingsSave.addEventListener("click", saveSettingsModal);
    els.settingsModal.addEventListener("click", (e) => {
      if (e.target === els.settingsModal) closeSettings();
    });

    els.resetCancel.addEventListener("click", closeResetConfirm);
    els.resetConfirm.addEventListener("click", () => {
      resetAll();
      closeResetConfirm();
    });
    els.resetModal.addEventListener("click", (e) => {
      if (e.target === els.resetModal) closeResetConfirm();
    });
  }

  // ---------- Init ----------
  function init() {
    loadSettings();
    els.topicInput.value = state.topic;
    render();
    wireEvents();
    rafHandle = requestAnimationFrame(tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
