# Progress (lead-maintained)

Plan: `/home/sdd/.claude/plans/you-are-the-lead-orchestrator-golden-goblet.md`. Decisions: PROJECT.md §14. Contract: docs/CONTRACT.md.

## Phase 0 — lead (done 2026-11-02)
- [x] `/api` Laravel 13: Sanctum, Socialite, Laravel Excel, Pest, pgsql :5433, routes glob `routes/api/*.php`
- [x] All migrations, models, enums, factories, `BelongsToMess` scope, `ResolveMess` + `mess.role` middleware, audit (trait + `AuditLogger`), seeder
- [x] Billing DTOs (frozen) + **gate tests** `api/tests/Unit/Billing/Gate/` (27 tests, red until A1/A2 land)
- [x] Mess isolation feature test (7 passing)
- [x] `/web` Next 16 + HeroUI v3 + next-intl (cookie locale, auto-merged messages) + TanStack Query + RHF/Zod + Vitest/MSW; `contract.ts`, nav registry, `[mess]` layout, `useMess()`
- [x] Contract fixtures + drift checks on both sides

## Waves
| Task | Wave | Status | Branch | Notes |
|---|---|---|---|---|
| A1 Engine: split, meals, rounding, charges | 1 | todo | | gate: LR + Charge tests |
| A2 Engine: balances, doesn't-pay, close check | 1 | todo | | gate: Balance + Close tests |
| C Auth & accounts API | 1 | todo | | |
| D Web foundation | 1 | todo | | |
| M Months & categories API | 2 | blocked by C | | |
| G Payments & cash API | 2 | blocked by C | | |
| W1 Web: auth, mess, members, settings | 2 | blocked by C, D | | |
| E Expenses API | 3 | blocked by M, G | | |
| F Meals API | 3 | blocked by M, G | | |
| H Fixed setup & deposits API | 3 | blocked by M, G | | |
| W2 Web: payments | 3 | blocked by G | | |
| J Live balances API | 4 | blocked by A1, A2, E, F, H | | |
| W3 Web: expenses | 4 | | | |
| W4 Web: meals & fixed setup | 4 | | | |
| K Month lifecycle API | 5 | blocked by J | | |
| L Excel export | 5 | | | |
| N Audit API | 5 | | | |
| W5 Web: dashboard, statements, overdue | 5 | | | |
| W6 Web: months & export | 6 | | | |
| W7 Web: audit + member actions | 6 | | | |
| P1 Bangla pass, P2 responsive pass, P3 PWA | 7 | | | sequential |

## Test commands
- API: `cd api && DB_DATABASE=mh_test_<task> php artisan test` (create the DB first: `createdb -h 127.0.0.1 -p 5433 -U mess_hisab mh_test_<task>`)
- Web: `cd web && pnpm test && pnpm build`
