# Bugs · Cycle 1 — found by Tester

## BUG-1 [P1] — 정지 후 활성팀 패널이 idle로 돌아오지 않음

**재현 절차:**
1. 페이지 로드.
2. `L` 키 → 반대팀 활성·시작.
3. `Space` 키 → 정지.

**기대:** 두 패널 모두 `data-state="idle"` (둘 다 dim).

**실제:** 반대팀 패널이 `data-state="active"`로 남아 있어 강조 색상이 유지됨.

**원인:** `panelState(side)`가 `state.active === side && !state.running` 분기를 "선택됐지만 멈춤 — 강조 유지"로 매핑하고 있음. UX적으로 "정지 = 둘 다 dim"이 더 직관적이고 테스트 기대와도 일치.

**수정 방향:** `panelState`에서 `!state.running`이면 무조건 `"idle"`을 반환.

---

## 통과한 항목 (참고)

- 초기 0:00.0 상태 ✅
- Space 단축키로 기본(찬성) 시작 ✅
- 시간 누적 ✅
- L 키로 팀 전환 (찬성 멈춤, 반대 시작) ✅
- 멈춘 팀의 누적 시간 동결 ✅
