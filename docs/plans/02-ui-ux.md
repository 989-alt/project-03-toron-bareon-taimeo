# UI/UX Plan — Day 03 · 토론 발언 타이머

## 적용 디자인 시스템

**주 브랜드**: **Linear** (`design-md/linear.app/DESIGN.md`)
- 토픽 명세가 직접 지정: "Linear (키보드·정밀) / 보조: Vercel (흑백 정밀)".
- TV 풀스크린 환경에서 깊은 검정 캔버스(#010102)는 거실/교실 모든 조도에서 부담 없음.
- 누적 시간 같은 정밀한 수치 표시에 Linear의 mono/display 폰트 무게가 적합.

design.md ↔ ui-ux-pro-max 가이드라인 충돌 시 design.md 우선 (지침).

## 컬러 토큰 (Linear 기반 + 토론 양팀용 페어 확장)

| 토큰 | 값 | 용도 |
|---|---|---|
| `--canvas` | `#010102` | 전체 배경 |
| `--surface-1` | `#0f1011` | 패널 (팀 카드, 모달) |
| `--surface-2` | `#141516` | 입력칸, 호버 surface |
| `--hairline` | `#23252a` | 패널 경계 1px |
| `--hairline-strong` | `#34343a` | 강조 경계 |
| `--ink` | `#f7f8f8` | 본문 텍스트 (대비 19.4:1 vs canvas — WCAG AAA) |
| `--ink-muted` | `#d0d6e0` | 보조 텍스트 |
| `--ink-subtle` | `#8a8f98` | 캡션·키 안내 |
| `--accent-pro` | `#5e6ad2` | **찬성팀** (Linear lavender) |
| `--accent-pro-hover` | `#828fff` | 찬성팀 활성 강조 |
| `--accent-con` | `#d2786a` | **반대팀** (lavender 보색 coral) — 좌/우 색 구분이 시각적 균형감을 줘 우/열 판단 회피 |
| `--accent-con-hover` | `#ee8a78` | 반대팀 활성 강조 |
| `--warn` | `#f59e0b` | 1인 한도 80% 도달 (amber fade) |
| `--critical` | `#ef4444` | 한도 100% 초과 flash |

- 대비비 검증: ink #f7f8f8 vs canvas #010102 ≈ 19.4:1 (AAA), accent-pro vs canvas ≈ 5.1:1 (AA large), accent-con vs canvas ≈ 5.8:1 (AA large) — 모두 통과.
- 활성 팀: 100% opacity. 비활성 팀: opacity 0.32 + grayscale(.35) 적용해 "지금 발언 중 아님"을 시각화.

## 타이포그래피

| 역할 | 폰트 | 크기 | 비고 |
|---|---|---|---|
| 누적 시간 (대) | `'JetBrains Mono', ui-monospace, monospace` | `clamp(120px, 22vw, 320px)` | 등폭으로 자릿수 흔들림 방지. TV 8m 거리에서도 가독. |
| 현재 발언 경과 | 동일 mono | `clamp(28px, 4vw, 64px)` | 누적과 시각적 위계 구분 |
| 팀 이름 | system-ui, -apple-system | `clamp(28px, 3vw, 56px)` | weight 600 |
| 발언 횟수 라벨 | system-ui | `clamp(14px, 1.3vw, 20px)` | uppercase + letter-spacing 0.08em (eyebrow 톤) |
| 버튼 / 키 안내 | system-ui | 14–16px | weight 500 |

Linear가 자체 폰트라 웹폰트 의존을 만들 수 없으므로 시스템 폰트로 대체. **CDN 의존 0 원칙 유지.**

## 화면 구조 (16:9 풀스크린 기준)

```
┌───────────────────────────────────────────────────────────────┐
│ HEADER ─ 좌: 토픽 입력(옵션) · 우: 설정⚙ · 음소거🔇 · 풀스크린⛶     │ 56px
├───────────────────┬───────────────────────────────────────────┤
│                   │                                           │
│   PRO PANEL       │             CON PANEL                     │
│   (찬성)          │             (반대)                        │
│                   │                                           │
│   1:23.4          │             0:58.7                        │ 누적 mono 거대
│                   │                                           │
│   발언 3회        │             발언 2회                      │
│   지금 0:42       │             —                             │ 현재 발언자
│                   │                                           │
├───────────────────┴───────────────────────────────────────────┤
│ BALANCE BAR ─────███████████████░░░░░░░░░░░░──── 64% / 36%    │ 36px
├───────────────────────────────────────────────────────────────┤
│ CONTROLS ─ [시작/정지 Space] [찬성 A] [반대 L] [리셋 R]          │ 72px
│ KEY HINTS ─ Space 토글 · A/L 팀전환 · F 풀스크린 · M 음소거       │ 28px
└───────────────────────────────────────────────────────────────┘
```

## 주요 컴포넌트

### TeamPanel (.team-panel)
- 자기완비 컴포넌트 2개 (좌/우). `data-side="pro"` / `data-side="con"` 어트리뷰트로 색 토큰 분기.
- `data-state="active" | "idle" | "warn" | "critical"`로 4 상태.
- 클릭 시 해당 팀 활성 + 즉시 시작. 키보드 포커스 가능 (`tabindex="0"`, role="button").

### BalanceBar (.balance-bar)
- 부모 width 기준 두 div의 flex-grow 비율로 표현. 양 팀 누적 시간 합산 0이면 50/50 균등.
- 격차 ≥ 60%/40%일 때 dim 한쪽 트랙에 `--warn` 미세 글로우 (`box-shadow: inset 0 0 12px var(--warn)`).

### SettingsModal (.modal)
- 가운데 정렬, surface-1 배경, max-width 480px.
- 팀 이름(2개) / 1인 한도 분·초 / 음소거 체크박스.
- Esc 키로 닫기. backdrop 클릭으로 닫기. 포커스 트랩 단순화: 첫 입력 focus + Esc만.

### ResetConfirmModal
- 동일 modal 스타일. 두 버튼: "취소"(secondary) / "리셋"(critical-tinted).
- R 키로 호출, Esc로 닫기, Enter로 확정 — 키보드 완결.

### Toast (.toast)
- 키 안내·음소거 토글 등 짧은 피드백. 우측 하단, 1.6s 자동 페이드.

## 인터랙션 / 애니메이션 디테일

- 활성 ↔ 비활성 전환: 200ms ease-out (opacity, filter).
- 경고 페이드(`warn` 상태): 600ms ease로 배경에 amber overlay 추가.
- `critical` 상태: 패널 테두리 2px red + 0.4s 깜빡임 2회 (`prefers-reduced-motion: reduce` 존중 — 깜빡임 제거, 정적 red border만).
- 비프음: 시작 880Hz 120ms / 정지 440Hz 120ms / 80% 경고 660Hz 80ms / 100% 한도 880Hz 220ms x2.
- 모든 버튼 hover: `--surface-2`로 배경 전환, 200ms.

## 접근성 체크

- 색 대비: 본문 ink/canvas 19.4:1 ✅, 활성 강조 5+:1 ✅.
- 키보드: Tab/Shift+Tab으로 모든 컨트롤 도달 가능. 활성 포커스 링 `outline: 2px solid var(--accent-pro); outline-offset: 2px;`.
- 모든 아이콘 버튼에 `aria-label`. 토스트는 `role="status"` aria-live polite.
- 시각 외 신호: 활성 팀 변경 시 짧은 비프(음소거 가능). 한도 초과는 색 + 비프 둘 다.
- `prefers-reduced-motion`: 모든 transition을 0.01ms로 단축, 깜빡임 제거.
- 모달: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` 헤딩 연결, 첫 포커스 자동 진입.

## 반응형 (보조 — TV 한정 토픽이지만 안전망)

- ≥ 1024px (기본): 좌/우 분할 50/50.
- 600–1023px: 동일하지만 누적 시간 폰트 크기 자동 축소 (clamp).
- < 600px: 세로 스택. 발표/배포 모니터에서 우발적 모바일 접근 시 깨지지 않는 정도.

## 아이콘

- SVG inline (Heroicons 24x24 outline 스타일). emoji 사용 금지.
- 사용: ⚙ (settings), 🔇/🔊 (mute), ⛶ (fullscreen), ↺ (reset).
- 모두 인라인 path로 작성, 외부 CDN 의존 0.
