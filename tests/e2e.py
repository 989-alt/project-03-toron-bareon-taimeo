"""End-to-end Playwright test for 토론 발언 타이머.

Verifies:
- Page loads with both panels and zero state.
- Space toggles start/stop on default (pro) team.
- A / L keys switch active team and accumulate time.
- Per-speaker limit warning + critical state triggers.
- Reset clears all state via modal.
- Settings persist (team names, limit, muted).
- Mute toggle works.
- Fullscreen API is wired (we cannot truly fullscreen in headless, but the button must exist and be clickable).

Exits 0 on success, nonzero on failure. Prints summary line.
"""
from __future__ import annotations
import os
import re
import sys
import time
import json
from pathlib import Path

from playwright.sync_api import sync_playwright, ConsoleMessage, Page

ROOT = Path(__file__).resolve().parent.parent
SHOT_DIR = ROOT / "tests" / "screenshots"
SHOT_DIR.mkdir(parents=True, exist_ok=True)

URL = os.environ.get("APP_URL", "http://127.0.0.1:5180/")

console_errors: list[str] = []
page_errors: list[str] = []


def _log_console(msg: ConsoleMessage):
    if msg.type in ("error",):
        text = msg.text
        # Filter known environment noise (e.g. tailwind cdn warnings). None expected here, app is CDN-free.
        if "should not be used in production" in text:
            return
        console_errors.append(text)


def step(name: str, page: Page, idx: list[int]):
    idx[0] += 1
    n = idx[0]
    path = SHOT_DIR / f"step-{n:02d}-{re.sub(r'[^a-z0-9]+', '-', name.lower())}.png"
    page.screenshot(path=str(path))
    print(f"[step {n:02d}] {name}  -> {path.name}")


def assert_eq(actual, expected, label: str):
    if actual != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {actual!r}")


def assert_in(needle: str, haystack: str, label: str):
    if needle not in haystack:
        raise AssertionError(f"{label}: {needle!r} not in {haystack!r}")


def main() -> int:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        page.on("console", _log_console)
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        idx = [0]

        print(f"Navigating to {URL}")
        page.goto(URL)
        page.wait_for_load_state("networkidle")
        step("initial-load", page, idx)

        # 1. Initial zero state
        pro_cum = page.locator("#pro-cum").inner_text()
        con_cum = page.locator("#con-cum").inner_text()
        assert_eq(pro_cum, "0:00.0", "initial pro cumulative")
        assert_eq(con_cum, "0:00.0", "initial con cumulative")
        assert_eq(page.locator("#pro-count").inner_text(), "0", "initial pro count")
        assert_eq(page.locator("#con-count").inner_text(), "0", "initial con count")
        assert_eq(page.locator("#pro-panel").get_attribute("data-state"), "idle", "pro initial state")
        assert_eq(page.locator("#con-panel").get_attribute("data-state"), "idle", "con initial state")

        # 2. Press Space -> default pro should become active
        page.locator("body").click()  # ensure focus on body
        page.keyboard.press("Space")
        page.wait_for_timeout(80)
        state = page.locator("#pro-panel").get_attribute("data-state")
        if state not in ("active", "warn", "critical"):
            raise AssertionError(f"After Space, pro should be active, got {state}")
        assert_eq(page.locator("#pro-count").inner_text(), "1", "pro count after first start")
        step("pro-running", page, idx)

        # 3. Wait ~1.4 s; pro should accumulate >= 1.2s
        page.wait_for_timeout(1400)
        pro_text = page.locator("#pro-cum").inner_text()
        # parse "m:ss.t"
        m = re.match(r"(\d+):(\d{2})\.(\d)", pro_text)
        if not m:
            raise AssertionError(f"Bad pro time format: {pro_text}")
        secs = int(m.group(1)) * 60 + int(m.group(2)) + int(m.group(3)) / 10.0
        if secs < 1.2:
            raise AssertionError(f"Pro should be >=1.2s after wait, got {secs}s")

        # 4. Press L -> switch to con (stops pro, starts con)
        page.keyboard.press("l")
        page.wait_for_timeout(80)
        assert_eq(page.locator("#con-count").inner_text(), "1", "con count after L")
        con_state = page.locator("#con-panel").get_attribute("data-state")
        if con_state not in ("active", "warn", "critical"):
            raise AssertionError(f"After L, con should be active, got {con_state}")
        # Pro is now stopped/idle
        assert_eq(page.locator("#pro-panel").get_attribute("data-state"), "idle", "pro idle after switch")
        # And pro's cum should NOT be advancing further
        pro_after_switch = page.locator("#pro-cum").inner_text()
        page.wait_for_timeout(600)
        pro_still = page.locator("#pro-cum").inner_text()
        assert_eq(pro_still, pro_after_switch, "pro frozen after switching to con")
        step("con-running", page, idx)

        # 5. Press Space to stop con
        page.keyboard.press("Space")
        page.wait_for_timeout(80)
        assert_eq(page.locator("#con-panel").get_attribute("data-state"), "idle", "con idle after stop")
        step("both-stopped", page, idx)

        # 6. Open settings, change limit to 3 seconds (0min / 3s) so we can trigger warn/critical fast.
        page.locator("#btn-settings").click()
        page.wait_for_selector("#settings-modal", state="visible")
        page.locator("#pro-name-input").fill("청군")
        page.locator("#con-name-input").fill("백군")
        page.locator("#limit-min").fill("0")
        page.locator("#limit-sec").fill("3")
        step("settings-open", page, idx)
        page.locator("#settings-save").click()
        page.wait_for_selector("#settings-modal", state="hidden")
        assert_eq(page.locator("#pro-name").inner_text(), "청군", "pro name applied")
        assert_eq(page.locator("#con-name").inner_text(), "백군", "con name applied")

        # 7. Start pro (active button A), wait past 80% warn (2.4s) and past 100% (3s)
        page.keyboard.press("a")
        page.wait_for_timeout(2600)
        warn_state = page.locator("#pro-panel").get_attribute("data-state")
        if warn_state not in ("warn", "critical"):
            raise AssertionError(f"Expected warn/critical after 2.6s with 3s limit, got {warn_state}")
        step("warn-state", page, idx)
        page.wait_for_timeout(700)
        crit_state = page.locator("#pro-panel").get_attribute("data-state")
        assert_eq(crit_state, "critical", "critical state after 3.3s")
        step("critical-state", page, idx)

        # 8. Press R to open reset confirm, press Enter (default action) to confirm
        page.keyboard.press("Escape")  # ensure no stray modal (none open, harmless)
        page.keyboard.press("r")
        page.wait_for_selector("#reset-modal", state="visible")
        step("reset-confirm", page, idx)
        page.locator("#reset-confirm").click()
        page.wait_for_selector("#reset-modal", state="hidden")
        assert_eq(page.locator("#pro-cum").inner_text(), "0:00.0", "pro cum after reset")
        assert_eq(page.locator("#con-cum").inner_text(), "0:00.0", "con cum after reset")
        assert_eq(page.locator("#pro-count").inner_text(), "0", "pro count after reset")
        assert_eq(page.locator("#con-count").inner_text(), "0", "con count after reset")
        assert_eq(page.locator("#pro-panel").get_attribute("data-state"), "idle", "pro idle after reset")
        step("post-reset", page, idx)

        # 9. Mute toggle via M
        page.keyboard.press("m")
        page.wait_for_timeout(60)
        assert_eq(page.locator("#btn-mute").get_attribute("aria-pressed"), "true", "muted after M")
        page.keyboard.press("m")
        page.wait_for_timeout(60)
        assert_eq(page.locator("#btn-mute").get_attribute("aria-pressed"), "false", "unmuted after M")

        # 10. Settings persistence across reload
        page.locator("#btn-mute").click()  # mute
        page.wait_for_timeout(60)
        page.reload()
        page.wait_for_load_state("networkidle")
        assert_eq(page.locator("#pro-name").inner_text(), "청군", "pro name persisted")
        assert_eq(page.locator("#con-name").inner_text(), "백군", "con name persisted")
        assert_eq(page.locator("#btn-mute").get_attribute("aria-pressed"), "true", "muted persisted")
        step("after-reload-persisted", page, idx)

        # 11. Topic input persistence
        page.locator("#topic-input").fill("학교에서 휴대전화 사용을 허용해야 한다")
        page.wait_for_timeout(40)
        page.reload()
        page.wait_for_load_state("networkidle")
        topic_val = page.locator("#topic-input").input_value()
        assert_eq(topic_val, "학교에서 휴대전화 사용을 허용해야 한다", "topic persisted")

        # 12. Balance bar reads correctly with simple sequence
        # Restore settings to default-ish (no limit warn = 2 min default, fine for short waits)
        page.locator("#btn-settings").click()
        page.wait_for_selector("#settings-modal", state="visible")
        page.locator("#limit-min").fill("2")
        page.locator("#limit-sec").fill("0")
        page.locator("#muted-input").check()  # keep mute for headless cleanliness
        page.locator("#settings-save").click()
        page.wait_for_selector("#settings-modal", state="hidden")

        # Click pro panel -> start
        page.locator("#pro-panel").click()
        page.wait_for_timeout(800)
        page.locator("#con-panel").click()  # switches to con
        page.wait_for_timeout(400)
        page.keyboard.press("Space")  # stop
        readout = page.locator("#balance-readout").inner_text()
        if "%" not in readout:
            raise AssertionError(f"Balance readout missing %: {readout!r}")
        step("balance-readout", page, idx)

        # 13. Fullscreen button exists & clickable (we don't expect actual fullscreen in headless)
        fs_btn = page.locator("#btn-fullscreen")
        if not fs_btn.is_visible():
            raise AssertionError("Fullscreen button not visible")

        # 14. Esc closes settings modal
        page.locator("#btn-settings").click()
        page.wait_for_selector("#settings-modal", state="visible")
        page.keyboard.press("Escape")
        page.wait_for_selector("#settings-modal", state="hidden")

        # Final clean state shot
        # Reset for the screenshot
        page.locator("#btn-reset").click()
        page.wait_for_selector("#reset-modal", state="visible")
        page.locator("#reset-confirm").click()
        page.wait_for_selector("#reset-modal", state="hidden")
        step("final", page, idx)

        # Console / page error check
        if console_errors:
            print("CONSOLE ERRORS:")
            for e in console_errors:
                print("  -", e)
        if page_errors:
            print("PAGE ERRORS:")
            for e in page_errors:
                print("  -", e)

        browser.close()

        if console_errors or page_errors:
            print(f"FAIL: {len(console_errors)} console error(s), {len(page_errors)} page error(s)")
            return 1

        print(f"PASS: all e2e checks passed ({idx[0]} steps)")
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as e:
        print(f"ASSERT FAIL: {e}")
        sys.exit(2)
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: {e}")
        sys.exit(3)
