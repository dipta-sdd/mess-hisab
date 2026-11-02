# Progress (lead-maintained)

Plan: `/home/sdd/.claude/plans/you-are-the-lead-orchestrator-golden-goblet.md`. Decisions: PROJECT.md §14. Contract: docs/CONTRACT.md.

## Phase 0 — lead (done 2026-11-02)
- [x] `/api` Laravel 13: Sanctum, Socialite, Laravel Excel, Pest, pgsql :5433, routes glob `routes/api/*.php`
- [x] All migrations, models, enums, factories, `BelongsToMess` scope, `ResolveMess` + `mess.role` middleware, audit (trait + `AuditLogger`), seeder
- [x] Billing DTOs (frozen) + **gate tests** `api/tests/Unit/Billing/Gate/` (27 tests, green since A1+A2 merge)
- [x] Mess isolation feature test (7 passing)
- [x] `/web` Next 16 + HeroUI v3 + next-intl (cookie locale, auto-merged messages) + TanStack Query + RHF/Zod + Vitest/MSW; `contract.ts`, nav registry, `[mess]` layout, `useMess()`
- [x] Contract fixtures + drift checks on both sides

## Waves
| Task | Wave | Status | Branch | Notes |
|---|---|---|---|---|
| A1 Engine: split, meals, rounding, charges | 1 | merged | worktree-agent-ae9d05337245e4b3b | gate: LR + Charge tests |
| A2 Engine: balances, doesn't-pay, close check | 1 | merged (private LR replaced by A1's) | worktree-agent-a901bbf0747fdcdb8 | gate: Balance + Close tests |
| C Auth & accounts | 1 | merged (Google link hardened by lead) | worktree-agent-a518c2b2036905045 | |
| D Web foundation | 1 | merged (formatMoney never rounds paisa away) | worktree-agent-a0a89bd43a2bb0d1e | |
| M Months & categories API | 2 | merged | worktree-agent-ab1bbe24c59d5bb47 | |
| G Payments & cash API | 2 | merged | worktree-agent-aee041d75e389152c | |
| W1 Web: auth, mess, members, settings | 2 | running | | |
| E Expenses API | 3 | merged | worktree-agent-abcf81579265b0506 | |
| F Meals API | 3 | merged | worktree-agent-a9c8aaccf69b58672 | |
| H Fixed setup & deposits API | 3 | merged (override ids normalised by lead) | worktree-agent-a9018563f6d9dffa0 | |
| W2 Web: payments | 3 | merged (nav registered) | worktree-agent-ace433c9d51f1cf36 | |
| J Live balances API | 4 | running | | |
| W3 Web: expenses | 4 | running (started early, E merged) | | |
| W4 Web: meals & fixed setup | 4 | running | | |
| K Month lifecycle API | 5 | blocked by J | | |
| L Excel export | 5 | | | |
| N Audit API | 5 | | | |
| W5 Web: dashboard, statements, overdue | 5 | | | |
| W6 Web: months & export | 6 | | | |
| W7 Web: audit + member actions | 6 | | | |
| P1 Bangla pass, P2 responsive pass, P3 PWA | 7 | | | sequential |

## Test commands
- API: `cd api && DB_DATABASE=mh_test_<task> php artisan test` (DBs mh_test_{a1,a2,c,m,g,e,f,h,j,k,l,n} exist; create others via `php artisan tinker --execute 'DB::statement("CREATE DATABASE mh_test_x")'`)
- Web: `cd web && pnpm test && pnpm build`

## Notes carried forward
- Engine (A1/A2) choices CONTRACT didn't fix: negative overrides and duplicate category bills throw; min payable skipped when P is null/0 or cost ≤ 0; a debtor with T ≥ 0 gets a 0 split; doesn't-pay with no other active members returns empty shares and mismatch = amount; duplicate debtor requests: first wins.
- For K: validate manual doesn't-pay shares at the HTTP layer (only other active members, ≥ 0); the engine applies them as typed. `Redistributor::splitFor(debtorId, …)` is an extra public helper used by `BalanceCalculator`.
- "Payments oldest deadline first" has nothing to act on inside one month (one fixed + one deposit deadline); revisit in J/K if multi-month dues appear.
- Web (D): `apiClient` paths are absolute (`/api/...`) and return the full JSON body; `useMe()` lives in `src/lib/api-client/auth.ts`. Nav icons known to the shell: dashboard, expenses, meals, payments, members, settings, months, audit, reports. `formatBalance(paisa, locale, mode, t)` with `t = useTranslations("common")`.
- API (C): `/api/auth/me` returns `{data: {user, memberships}}`. Links to the web app go through `App\Services\Auth\FrontendUrl` (`config('app.frontend_url')`). Lead change after merge: Google sign-in refuses `email_verified=false`, and when it links to an *unverified* local account it drops that account's password, tokens and sessions (stops pre-account hijacking).
- Open (C): adding a member with an opening balance needs an open month (422 otherwise); archiving a member doesn't check their balance yet (K's final settlement should gate it).
- API (G): payments write no ledger row (they are their own term in §3). `CashPool::balance()` is not clamped; E must refuse/convert so it never goes negative. `PaymentMonth` has a `TODO(lead)` to switch to `Calendar::monthFor` when M merges. Open: payments dated outside a member's joined_on/left_on are not rejected; editing may change member_id/group while the month is open.
- API (M): `Calendar::monthFor` returns the month containing a date (any status) and creates missing gap months, all open; dates after today's month throw `CalendarException(date_in_future)`, before the first month `date_before_first_month`. Callers map `CalendarException` to 422. `/months/current` forces 200 (a JsonResource of a just-created model answers 201 — K must do the same). New months copy `food_carry_in_paisa` from the previous month's `food_carry_out_paisa`; K should set the carry explicitly on close. Gap months are open, so K's "previous month open" block applies to them. Category extras beyond CONTRACT: PATCH on an archived category → 409 `category_archived`; names unique per group (case-insensitive); DELETE returns 200 with the archived Category. Lead switched `PaymentMonth` to `Calendar::monthFor` on merge.
- API (F): meals are multiples of 50 centi (≤1000/day, ≤31000/month; constants in `MealRules`); bld_ticks values are computed and not step-checked. No late entry for meals (closed month → 409). Self-entered guest meals have no confirmation (PROJECT §12 risk). No `DELETE /meals` (PUT 0). A concurrent first write can hit the unique index and return 500 — fix in polish.
- Web (W2): `features/<x>/nav.ts` exports a single `NavItem`; register as `xNav,` in `nav-registry.ts`. Payments defines `CashPool` and `MessWithMe` locally in `features/payments/api.ts` — promote to `contract.ts` if a second feature needs them. Native form controls + HeroUI Button. 422 `paid_on` text is the server's English message (translate in P1).
- API (E): short cash converts the WHOLE expense to the manager's own money (PROJECT §4 "500 with 200 in pool"); check + insert under a mess-row lock; re-checked at approve and on edits that change amount/paid_by. Members can only record `paid_by=member` with themselves (422 otherwise). Rejected expenses can't be edited (409 `expense_rejected`), only deleted. Approve/reject a non-pending one → 409 `not_pending`. `ExpensePolicy` is a plain class called by the service (Gate can't see MessMember roles). POST returns `{data: {expense, warnings}}`; DELETE 204 soft delete.
- Lead fix after E: a non-manager editing an expense not paid from their own pocket (cash, or another member — e.g. recorded while they were manager) gets 422 `paid_by` even when the payer isn't re-sent.
- API (H): `BillSetup` helpers for J/K: `activeMemberIds($month)`, `billsFor($month)`, `billFor($month, $category)`. Fixed bill: amount + per-person overrides; the rest is shared equally (LR) over the non-overridden members. Spread puts the unallocated amount equally (LR) over the non-overridden members (everyone if all are overridden) and writes the result as overrides; the accept flag resets on PUT and on spread. Errors: 409 `amount_required`, `nothing_to_spread`, `over_allocated`, `category_archived`. A null deadline means no overdue tracking. Lead fix: override `member_id` sent as a numeric string is normalised before the active-member check.
