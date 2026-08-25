# Frontend Harness — Sojan 风铃动效

Workflow: 3.2
Task: 重绘 BellLogo，并以风铃为绝对主角重做应用内测算过场
Role: Primary Agent
Mode / rationale: Fast — 共享组件新增 `cast/full-detail` 展示能力；无新依赖、数据、路由或业务流程
Canonical record: `.agent/frontend-harness/logo-wind-motion.md`
Branch / worktree: `main`；保留现有用户改动
Mockup Gate: Not required — 时间性动效按 owner 已批准的文字设计进行浏览器验证
Review path: 组件测试 → web 回归 → 浏览器视觉检查 → reduced-motion 检查
Human checkpoints: 2026-08-25 动效设计已批准；交付后由 owner 做最终观感确认

## Scope

- 重绘风铃为挂环、横梁、吊线、铜铃、铃舌与尾坠六层；小尺寸保持清楚，大尺寸增加材质细节。
- 为 `BellLogo` 新增 `motion="cast"` 与 `detail="full"`，保留既有 idle/ring/none 语义。
- 过场删除命盘环、干支与印章，只保留纸底、大号风铃、状态文字和一层克制的空气压缩波。
- 过场使用非对称阵风、铃身与铃舌逐层滞后、阴影随摆动的节奏；长等待时低频重放。
- `prefers-reduced-motion: reduce` 下完全静止且内容仍可见。

## Status

State: Ready for owner review
Base: `main` at task start
Next safe action: owner reviews the animation feel in `/calendar`, `/fengshui`, or `/dream`; adjust only amplitude, pacing, or scale if requested

## Evidence

- Design approval: user confirmed in task conversation on 2026-08-25.
- TDD red: `BellLogo.test.tsx` failed 3/3 before the nested motion groups existed.
- TDD green: focused BellLogo test passed 3/3 after implementation.
- Full web tests: 55 files, 623 tests passed.
- Changed-file lint: `components/ui.tsx` and `components/__tests__/BellLogo.test.tsx` passed with zero findings.
- Production build: Next.js 16.2.9 compiled, type-checked, and generated all 17 static pages successfully.
- Browser `/`: page content rendered, no framework error overlay; `zjBellRing`, `zjBellBodyRing`, and `zjBellClapperRing` all ran at 0.95s.
- Browser `/reading`: all three idle layers ran at 5.2s infinitely; transform samples confirmed distinct shell/body/clapper motion. The parsed reduced-motion media rule disables every bell animation class.
- Existing unrelated findings: full-repository lint is blocked by two `SpiritPanel.tsx` memoization errors and 17 existing warnings. Production browser also logs React hydration error #418 from the existing server/client locale mismatch; neither finding originates in the changed files.
- Reopened TDD red: cast inertia, full-detail artwork, protagonist-only composition, accessibility status, and brief exit mode all failed before their implementations.
- Final focused tests: BellLogo + CastingOverlay, 6/6 passed.
- Final full web tests: 56 files, 626/626 passed.
- Final component lint: BellLogo, CastingOverlay, and their tests passed with zero findings; touched page files retain eight pre-existing warnings and no errors.
- Final production build: Next.js 16.2.9 compiled, type-checked, and generated the expected 17 pages; temporary `/motion-preview` route was removed before this build.
- Browser QA: 1440×900 and 390×844 both rendered without horizontal overflow; the 132px full-detail bell, delayed copy, soft moving shadow, and distinct shell/body/clapper transforms were observed. Production CSS contains the cast reduced-motion shutdown and hides the air line.

## Done Card

Revision: working tree on `main` (not committed)
Files: `apps/web/components/ui.tsx`, `apps/web/components/CastingOverlay.tsx`, `apps/web/app/globals.css`, three application callers, two component tests, and `apps/web/public/brand/sojan-bell-logo.svg`
Outcome: redrawn six-layer bell, cast-specific layered inertia, protagonist-only transition, moving shadow/air compression, delayed copy, brief fade-out for fixed transitions, pending mode for long requests, and reduced-motion fallback
Rollback: revert the implementation files above; no data or dependency rollback is required
Owner decision: 2026-08-25 approved the protagonist composition and higher-fidelity bell redraw; final motion-feel review pending
