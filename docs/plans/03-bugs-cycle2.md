# Bugs · Cycle 2 — found by Tester

## BUG-2 [P1] — 누적 시간 숫자가 패널 폭을 넘어 좌우로 잘림

**재현 절차:**
1. 페이지를 1280×800 이상에서 연다.
2. 양쪽 패널의 "0:00.0" 숫자를 본다.

**기대:** 7자리(`12:34.5` 포함) 모두 패널 안에 들어가야 한다.

**실제:** 1280px 뷰포트에서 `0:00.0`의 첫 `0`이 뷰포트 좌측 밖으로 잘리고, 마지막 `.0`이 패널 우측 밖으로 흐른다.

**원인:** `clamp(96px, 18vw, 280px)`가 1280vp에서 230.4px → 7 mono 자(약 0.55em width)에 대해 7×0.55×230.4 ≈ 887px가 필요하나 패널 inner 폭은 약 552px.

**수정 방향:**
- `font-size`를 `clamp(56px, 11vw, 168px)`로 줄임 (1280vp에서 140.8px → 약 542px 필요 → 패널 안 fit).
- `.panel-inner`에 `min-width: 0`과 `max-width: 100%` 보강 (overflow 안전망).
- `letter-spacing`을 `-0.03em`으로 살짝 완화.

---

## (참고) P0/P1 외 통과 항목

- 모든 12개 e2e 시나리오 통과 (assert 기준)
- console error 0, page error 0
- 정지 후 idle 복귀 ✅
- localStorage 영속화 ✅ (이름·한도·음소거·토픽)
- warn/critical 상태 전이 ✅
- 한국어 IME 키(ㅁ/ㅣ/ㄹ/ㅡ/ㄱ) 폴백 ✅
