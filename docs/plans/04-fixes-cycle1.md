# Fixes · Cycle 1

## FIX-1 (for BUG-1)

`app.js` — `panelState(side)`를 단순화:

- 변경 전: `state.active === side && !state.running` 일 때 "active" 반환 → 정지 후 강조 색이 유지.
- 변경 후: `!state.running || state.active !== side` 면 무조건 "idle".

UX 의미: 정지 = 두 패널 모두 dim. 다음 발언자 선택은 A/L 또는 패널 클릭으로 명시. (다음 발언자 "선예약" 상태를 색으로 보여주지 않음으로써, 정지 ↔ 진행 상태가 더 명확.)
