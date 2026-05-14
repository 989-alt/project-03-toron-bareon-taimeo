# Fixes · Cycle 2

## FIX-2 (for BUG-2)

`styles.css`:
1. `.cumulative`의 `font-size`를 `clamp(96px, 18vw, 280px)` → `clamp(56px, 11vw, 168px)`로 축소. 7자(`12:34.5`) 기준 1280vp 패널에 fit.
2. `.cumulative`에 `width: 100%; overflow: hidden;` 안전망 추가.
3. `letter-spacing` `-0.04em` → `-0.03em`.
4. 모바일 미디어쿼리도 `clamp(48px, 16vw, 120px)`로 조정.
5. `.panel-inner`에 `min-width: 0; max-width: 100%`.

TV (1920×1080) 기준 cumulative ≈ 168px (clamp 상한) → 충분히 큼.
교실 노트북 (1280×800) 기준 ≈ 141px → 명확.
