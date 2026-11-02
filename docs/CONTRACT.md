# Mess Hisab — Technical Contract

> Source of truth for every builder. PROJECT.md says *what* and *why*; this file says *exactly how*.
> Only the lead edits this file. If something here is wrong or missing, **stop and report** — do not improvise.

---

## 0. Conventions

| Thing | Rule |
|---|---|
| Money | Integer **paisa** (`bigint`, PHP `int`, TS `number`). 1 taka = 100 paisa. Field names end in `_paisa`. Never floats, never decimal strings. |
| Meals | Integer **centi-meals** (`int`). 1 meal = 100, 2.5 meals = 250, breakfast weight 0.5 = 50. Field names end in `_centi`. |
| Sign | A member **balance** is **positive = credit** (mess owes the member), **negative = due** (member owes). Ledger amounts use the same sign from the member's point of view. Charges in DTOs are positive numbers that are *subtracted*. |
| Splitting | Always `LargestRemainder` (§5.1). Shares always sum exactly to the total. |
| Dates | `YYYY-MM-DD` strings in JSON, `date` columns in DB. Business timezone **Asia/Dhaka** (`config('app.timezone')`). |
| IDs | `bigint` auto-increment. JSON ids are numbers. |
| Mess scope | Every mess-owned table has `mess_id`. Every mess endpoint lives under `/api/messes/{mess}/…` behind `auth:sanctum` + `mess` middleware. A user who is not a member gets **404** (not 403). |
| Roles | Exactly one **admin** and one **manager** per mess (`messes.admin_member_id`, `messes.manager_member_id`; may be the same member). Everyone else is a **member**. Role checks: `MessMember::isAdmin()`, `isManager()`; route middleware `mess.role:manager`, `mess.role:admin`, `mess.role:admin,manager`. Archived members: read-only (GET only). |
| Errors | Validation: Laravel default **422** `{message, errors:{field:[...]}}`. Domain rule broken: **409** `{message, code}` where `code` is a snake_case string listed in the endpoint. Forbidden role: **403** `{message}`. |
| Tests | Pest. Run with `DB_DATABASE=mh_test_<task> php artisan test`. Every endpoint test file covers: happy path, validation, **other mess → 404**, **wrong role → 403**. |

---

## 1. Enums (`app/Enums`, mirrored in `web/src/lib/api/contract.ts`)

| Enum | Values |
|---|---|
| `Group` | `fixed`, `meals` |
| `SplitType` | `equal`, `fixed_per_person`, `by_meal` (by_meal only allowed for `meals` group) |
| `RoundingMode` | `whole_taka`, `round_up`, `two_decimals` |
| `MealTracking` | `off`, `daily_number`, `bld_ticks`, `month_total` |
| `MealEntryBy` | `manager`, `self` |
| `MonthStatus` | `open`, `closed` |
| `ZeroMealResolution` | `split_equal`, `carry` |
| `PaidBy` | `member`, `cash` |
| `ExpenseStatus` | `pending`, `approved`, `rejected` |
| `LedgerType` | `opening`, `charge`, `rounding`, `adjustment`, `doesnt_pay_out`, `doesnt_pay_in`, `recoverable_repay`, `final_payout` |
| `DoesntPayMode` | `equal`, `by_meals`, `manual` |
| `RecoverableStatus` | `pending` (month open), `open` (materialised, unpaid), `settled`, `undone` |
| `ExportStatus` | `queued`, `running`, `done`, `failed` |
| `Locale` | `en`, `bn` |

---

## 2. Database schema (all migrations written by the lead in Phase 0 — **frozen**)

All tables have `created_at`/`updated_at` unless noted. FK = foreign key, cascade only where stated.

**users** — id, name, email (unique), password (nullable — Google-only users), google_id (nullable, unique), locale (`en`), email_verified_at, remember_token.

**messes** — id, name, currency (`BDT`), month_start_day (smallint 1–28, default 1), admin_member_id (nullable FK mess_members, set after creation), manager_member_id (nullable FK), approval_required (bool, false), rounding_mode (`whole_taka`), meal_tracking (`daily_number`), meal_entry_by (`manager`), breakfast_weight_centi (50), lunch_weight_centi (100), dinner_weight_centi (100), min_meals_enabled (false), min_meals_centi (nullable int), min_payable_enabled (false), min_payable_paisa (nullable bigint), deposit_paisa (bigint 0), fixed_due_day_offset (smallint 5 — deadline = month start + N−1 days), deposit_due_day_offset (smallint 5), created_by_user_id (FK users).

**mess_members** — id, mess_id, user_id (nullable FK — a placeholder member exists before the person accepts an invite), display_name, joined_on (date), left_on (nullable date), archived_at (nullable). unique(mess_id, user_id).

**invites** — id, mess_id, token (unique, 40 chars), member_id (nullable FK — claims that placeholder slot), created_by_member_id, expires_at (nullable), max_uses (nullable int), uses (int 0), revoked_at (nullable).

**months** — id, mess_id, starts_on, ends_on, status (`open`), fixed_deadline (nullable date), deposit_deadline (nullable date), deposit_paisa (bigint — copied from mess on creation), zero_meal_resolution (nullable), food_carry_in_paisa (bigint 0 — = previous month's carry_out), food_carry_out_paisa (bigint 0 — set at close when resolution = carry), closed_at, closed_by_member_id, reopened_at (nullable). unique(mess_id, starts_on).

**categories** — id, mess_id, group, name, split_type, sort (int 0), is_default (bool), archived_at (nullable). Check: `by_meal` ⇒ group = `meals`.

**month_bills** — one row per (month, category) that has setup. id, mess_id, month_id, category_id, amount_paisa (nullable bigint — required for `fixed` group; NULL for `meals` group, whose total = approved expenses), unallocated_accepted (bool false). unique(month_id, category_id).

**charge_overrides** — per-person amount for a category in a month. id, mess_id, month_id, category_id, member_id, amount_paisa (bigint ≥ 0). unique(month_id, category_id, member_id). For `fixed_per_person` these *are* the amounts; for `equal` they pin that person and the rest is split equally among the others.

**member_month_settings** — id, mess_id, month_id, member_id, deposit_paisa (nullable — overrides month.deposit_paisa), min_meals_centi (nullable — overrides mess min for late joiners/leavers). unique(month_id, member_id).

**expenses** — id, mess_id, month_id, category_id, amount_paisa (>0), spent_on (date), note (nullable text), paid_by (`member`|`cash`), paid_by_member_id (nullable — required when paid_by = member), status (`approved` or `pending`), approved_by_member_id, approved_at, rejected_reason (nullable), is_late (bool), short_cash_converted (bool), is_self_recorded (bool — created by the then-manager), created_by_member_id, deleted_at (soft delete).

**meal_entries** — id, mess_id, month_id, member_id, entry_date (date; for `month_total` style = month.starts_on), breakfast/lunch/dinner (nullable bool — only for `bld_ticks`), meals_centi (int ≥ 0 — own meals, already weighted), guest_meals_centi (int ≥ 0), entered_by_member_id. unique(member_id, entry_date).

**payments** — id, mess_id, month_id, member_id, group, amount_paisa (>0), paid_on, note, received_by_member_id (the manager at the time), created_by_member_id, deleted_at (soft delete).

**ledger_entries** — id, mess_id, month_id, member_id (nullable), group (nullable), type (`LedgerType`), amount_paisa (signed, member's view), note (nullable), source_type / source_id (nullable morph), meta (jsonb nullable), created_by_member_id (nullable), created_at only.

**recoverables** — id, mess_id, month_id, debtor_member_id, mode (`DoesntPayMode`), status, amount_paisa (nullable until close), repaid_paisa (bigint 0), created_by_member_id, undone_at.
**recoverable_shares** — id, mess_id, recoverable_id, member_id, manual_amount_paisa (nullable — input for `manual` mode), amount_paisa (nullable — final, set at close).
**recoverable_repayments** — id, mess_id, recoverable_id, month_id, amount_paisa, paid_on, created_by_member_id.

**final_payouts** are `ledger_entries` (type `final_payout`, negative amount) + they reduce cash.

**audit_logs** — id, mess_id (nullable), user_id (nullable), member_id (nullable), event (string, e.g. `expense.created`, `month.closed`), subject_type, subject_id, before (jsonb), after (jsonb), meta (jsonb), created_at only.

**exports** — id, mess_id, requested_by_member_id, type (`month`|`statement`), params (jsonb), status, path (nullable), error (nullable).

Plus Laravel defaults: sessions, cache, jobs, password_reset_tokens, personal_access_tokens.

---

## 3. Money identities (everything else follows from these)

For a member *m*, over **all history up to and including month M**:

```
balance(m) = Σ payments(m) + Σ approved own-pocket expenses(m) + Σ recoverable_repay credits(m)
           + Σ ledger_entries(m)            -- opening, adjustment, doesnt_pay_*, final_payout, and (closed months) charge + rounding
           − Σ live charges(m) for the OPEN month (computed by the engine, not stored)
```

- **Open month:** charges are computed live by the engine from raw rows. Nothing is stored.
- **Close:** the lead-designed service (task K) writes the engine's result as `charge` and `rounding` ledger rows (negative), plus `doesnt_pay_out/in` rows. **Reopen** deletes exactly the rows written by that close (`source_type = 'month_close'`, `source_id = month.id`).
- **carry_in(M)** for a member = balance over all months *before* M + that member's `opening` ledger rows inside M. It is shown on the Fixed side as the line **"Last month due"** (PROJECT decision #4).

**Cash pool** (mess level, follows the manager role, never negative):
```
cash = Σ payments + Σ recoverable_repayments − Σ approved cash expenses − Σ |final_payout|
```

**Close check identity** (must hold to the paisa, cumulative over all history incl. the open month, task K).
Derivation: cash − Σbalance = Σcharges − Σapproved expenses (cash *and* own-pocket) − Σopening − Σadjustments − Σdoesnt_pay rows; payments, repayments and final payouts cancel. Each bill's charges = its total − its unallocated; a bill's total is `month_bills.amount_paisa` for the fixed group and Σ approved expenses of that category for the meals group; the by-meal pool's charges = its cost − uncharged food. So:
```
cash − Σ balance(all members incl. archived)
  =  Σ fixed month_bills.amount_paisa − Σ approved fixed-group expenses   -- fixed money held, not yet spent
  −  Σ unallocated_paisa over ALL bills (fixed and meals)                 -- bill parts nobody was charged (negative = over-allocated)
  +  Σ rounding delta                                                     -- (charged − exact); round_up extra is positive
  −  Σ opening ledger rows
  −  Σ adjustment ledger rows
  −  uncharged food cost                                                  -- by-meal cost charged to nobody yet (carried, or zero meals unresolved)
  −  Σ doesnt_pay rows (out + in)                                         -- 0 unless manual shares don't sum to |T| (close is blocked then anyway)
```
Note that by-meal food carried from month M to M+1 is charged in M+1, so over all history only the *open* month's uncharged food remains. The engine (`CloseCheck`) takes every term separately and returns the difference; K compares exactly. A mismatch blocks close with code `cash_mismatch` and shows the difference.

**Active member in a month** (who shares `equal` bills, zero-meal `split_equal`, doesn't-pay `equal`): `joined_on ≤ month.ends_on` AND (`left_on` IS NULL OR `left_on ≥ month.starts_on`). Archiving requires `left_on` (archive sets it to today if empty). No pro-rating: for part-month members the manager edits amounts by hand (PROJECT §6).

---

## 4. Rules with numeric examples (builders: test every one)

1. **Largest remainder.** 800000 by weights 60/50/40/20 → floors 282352/235294/188235/94117 (=799998); fractions A .941, B .118, C .294, D .647; the 2 leftover paisa go to A and D → **282353/235294/188235/94118**. Ties on fraction: lowest key (member id) first. Negative total: split |total| and negate.
2. **Meal charge.** effective_i = max(meals_i, min_i) when a minimum applies. Charge = LR(cost, effective). §5 example: cost 1000000, meals A 100, B 90, Nilu 10 (×100 centi), min 20 → effective 100/90/20, total 210 → A 476191, B 428571, Nilu **95238**.
3. **Min payable** (after min meals, meal charge only). If charge_i < P, set to P; surplus S = Σ(P − charge_i) is taken off the others by LR over their effective meals. Repeat until nobody is below P. If P × n ≥ cost, everybody pays an equal LR split of cost. Example: cost 300000, meals A 100 / B 100 / C 10 (no min meals), P 50000 → raw LR 142857/142857/14286 → C raised to 50000, surplus 35714 taken off A and B by LR 1:1 = 17857 each → **A 125000, B 125000, C 50000** (total 300000). Guests: a member's guest meals are added to that member's own meals before any of this.
4. **Zero meals.** If total effective meals = 0 and cost > 0: blocked (`zero_meals_unresolved`) until resolution. `split_equal` → LR equal among active members; `carry` → no meal charges, cost carried as `food_carry_out` and added to next month's by-meal cost.
5. **Equal bill with overrides.** Bill 90000, members X/Y/Z, override Z = 10000 → X, Y split 80000 → 40000 each. If every member is overridden (or `fixed_per_person`), `unallocated = total − Σ shares` (can be negative = over-allocated). Remainder < 0 with non-overridden members → they get 0, unallocated = remainder.
6. **Rounding** applies to each member's **group total for the month** (fixed total, meals total), never per category.
   - `two_decimals`: no change, delta 0.
   - `whole_taka`: target = group total rounded half-up to whole taka; LR over members' exact amounts in taka units; `rounding delta = charged − exact` (± few paisa, shown as the "rounding" line). Example 1 meals 282353/235294/188235/94118 → **2824/2353/1882/941 taka**, delta 0.
   - `round_up`: each member's group total rounded **up** to the whole taka; extra stays in mess cash, shown as "rounding extra". 52115 → 52200 (extra 85).
7. **Balances & overdue** (per member, open month):
   - `fixed_balance = carry_in + fixed payments + fixed own-pocket expenses + fixed adjustments + fixed other ledger − fixed charges`
   - `meals_balance` = same for meals group (deposit is **not** a charge; meals payments count toward it).
   - **Cross-group netting:** `fixed_outstanding = max(0, −(fixed_balance + max(0, meals_balance)))`.
     Example: X fixed −230000, meals +70000 → fixed_outstanding **160000**.
   - **Deposit:** `deposit_outstanding = max(0, deposit_required − (meals payments + meals own-pocket expenses + meals adjustments + max(0, fixed_balance)))`.
   - Overdue days = today − deadline when outstanding > 0 and today > deadline; else 0. No late fee.
8. **Doesn't pay** (before close; computed on the debtor's **total** balance T < 0 at close; live preview while open). Debtor gets +|T| (`doesnt_pay_out`, group fixed); others get −share (`doesnt_pay_in`, group fixed). Mode `equal` = LR equal among other active members; `by_meals` = LR by effective meals; `manual` = typed amounts, must sum to |T| or close is blocked (`doesnt_pay_mismatch`). Shares are saved; a later repayment R is credited back LR by the saved shares (`recoverable_repay`, positive), also to archived members ("payable to ex-member").
   Excel October: S/D/N paid 345000/837200/276000 own-pocket, equal meals split of 1458200 → 486067/486067/486066 → balances −141067/+351133/−210066 → N doesn't pay, equal → **S −246100, D +246100, N 0**, recoverable 210066.

---

## 5. Billing engine (`app/Billing`, pure PHP — no Eloquent, no facades, no DB)

Lead-owned and **frozen** (Phase 0): `app/Billing/Dto/**` (readonly DTO classes) and the `App\Enums` it uses. Engine agents implement the classes below and nothing else public. All `array<int,int>` maps are keyed by **member id in ascending order** (that order is the tie-break). Group-keyed maps use the `Group` enum *value* (`'fixed'`, `'meals'`) as key.

**Gate tests** (`tests/Unit/Billing/Gate/`, lead-owned, read-only for agents) call only: `LargestRemainder`, `ChargeCalculator`, `BalanceCalculator`, `CloseCheck`, `RepaymentAllocator`.

### 5.1 Task A1 owns `app/Billing/{Split,Meals,Rounding,Charges}/**`
- `Split\LargestRemainder::split(int $total, array $weights): array` — `$weights` `[key => int ≥ 0]`; returns same keys/order, sum = `$total`. Ties on fraction → earlier key in the array first. Negative total → split |total|, negate. All-zero weights & total ≠ 0 → `InvalidArgumentException`. Empty weights & total 0 → `[]`.
- `Split\BillSplitter::split(BillInput $bill): BillSplit` — §4.5. Override keys not in `$bill->memberIds` → `InvalidArgumentException`.
- `Meals\MealChargeCalculator::calculate(MealInput $in): MealResult` — §4.2–4.4.
- `Rounding\Rounder::apply(RoundingMode $mode, array $exact): RoundingResult` — §4.6; `$exact` values must be ≥ 0. `whole_taka` precisely: target taka `T = round_half_up(Σexact / 100)`; each member `floor(exact/100)`; give +1 taka to the `T − Σfloors` members with the largest `exact mod 100` (tie → lower id). If `T − Σfloors` is negative (can't happen with half-up) throw.
- `Charges\ChargeCalculator::calculate(ChargeInput $in): ChargeResult` — splits every bill, runs the meal pool, sums each member's exact amount **per group** (fixed = fixed bills; meals = meals bills + meal pool), rounds each group total per member with `Rounder`.

### 5.2 Task A2 owns `app/Billing/{Balance,DoesntPay}/**`
- `Balance\BalanceCalculator::calculate(BalanceInput $in): BalanceResult` — §4.7 + live doesn't-pay §4.8.
- `DoesntPay\Redistributor::split(int $amount, DoesntPayMode $mode, array $memberIds, array $mealWeights, array $manual): DoesntPaySplit` — `equal`: LR equal over `$memberIds`; `by_meals`: LR by `$mealWeights` (all zero → falls back to equal); `manual`: shares = `$manual` as typed, `mismatchPaisa = $amount − Σshares`.
- `DoesntPay\RepaymentAllocator::allocate(int $repayment, array $savedShares): array` — LR of `$repayment` by saved shares.
- `Balance\CloseCheck::verify(CloseCheckInput $in): CloseCheckResult` — identity §3.
A2's own tests build `ChargeResult`-free inputs (BalanceInput takes plain charge maps), so A2 never needs A1's code.

### 5.3 DTOs (`App\Billing\Dto`, all `final readonly`, constructor-promoted public properties)
```php
BillInput(int $categoryId, Group $group, SplitType $splitType /* equal|fixed_per_person */,
          int $totalPaisa, array $memberIds /* active, asc */, array $overrides /* [memberId => paisa] */)
BillSplit(int $categoryId, Group $group, array $shares /* [memberId => paisa], every memberId present */,
          int $unallocatedPaisa /* total − Σshares */)

MealInput(int $costPaisa /* Σ approved by_meal expenses + food_carry_in */,
          array $memberIds, array $mealsCenti /* own + guest, [memberId => int] */,
          array $minMealsCenti /* [memberId => ?int], null = no minimum */,
          ?int $minPayablePaisa, ?ZeroMealResolution $zeroMealResolution)
MealResult(array $charges, array $effectiveMealsCenti, int $totalEffectiveMealsCenti,
           int $displayRatePaisa /* round_half_up(cost*100/totalEffective) — display only, 0 if no meals */,
           bool $zeroMealsUnresolved /* cost>0, totalEffective=0, resolution null → charges all 0 */,
           int $carryOutPaisa /* resolution carry → cost, else 0 */,
           int $unchargedFoodPaisa /* = cost when unresolved or carried, else 0 */)

RoundingResult(array $charged, array $delta /* charged − exact */, int $totalDeltaPaisa)

ChargeInput(int $monthId, array $memberIds /* active, asc */, RoundingMode $roundingMode,
            array $bills /* BillInput[] — every non-by_meal category with a total or overrides */,
            MealInput $meals)
ChargeResult(array $bills /* [categoryId => BillSplit] */, MealResult $meal,
             array $exact /* ['fixed'=>[m=>p], 'meals'=>[m=>p]] */,
             array $rounding /* ['fixed'=>RoundingResult, 'meals'=>RoundingResult] */,
             array $charged /* ['fixed'=>[m=>p], 'meals'=>[m=>p]] after rounding */,
             int $totalUnallocatedPaisa, int $totalRoundingDeltaPaisa, int $unchargedFoodPaisa)

DoesntPayRequest(int $debtorMemberId, DoesntPayMode $mode, array $manual /* [memberId => paisa] */)
DoesntPaySplit(int $debtorMemberId, int $amountPaisa /* |T|, 0 if T ≥ 0 */, array $shares, int $mismatchPaisa)

BalanceInput(array $memberIds /* everyone to report, asc */, array $activeMemberIds,
             array $carryIn /* [m => p] balance before this month (all groups) → shown on fixed side */,
             array $payments, array $ownPocket, array $ledger, array $charges /* each ['fixed'=>[m=>p],'meals'=>[m=>p]] */,
             array $mealWeights /* effective meals, for doesn't-pay by_meals */,
             array $doesntPay /* DoesntPayRequest[] — live only (open month) */,
             array $depositRequired /* [m => p] */,
             ?string $fixedDeadline, ?string $depositDeadline, string $today /* Y-m-d */)
  // ledger = this month's ledger rows except charge/rounding (for a closed month: charge/rounding rows go in $charges as positive numbers, stored doesnt_pay rows go in $ledger['fixed'])
GroupBalance(int $carryInPaisa /* fixed only, 0 for meals */, int $paymentsPaisa, int $ownPocketPaisa,
             int $ledgerPaisa, int $chargesPaisa, int $doesntPayPaisa, int $balancePaisa)
MemberBalance(int $memberId, GroupBalance $fixed, GroupBalance $meals, int $totalPaisa,
              int $fixedOutstandingPaisa, int $depositRequiredPaisa, int $depositOutstandingPaisa,
              int $fixedOverdueDays, int $depositOverdueDays)
BalanceResult(array $members /* [memberId => MemberBalance] */, array $doesntPay /* DoesntPaySplit[] */)

CloseCheckInput(int $cashPaisa, int $sumBalancesPaisa, int $fixedBillsPaisa, int $fixedExpensesPaisa,
                int $unallocatedPaisa, int $roundingDeltaPaisa, int $openingPaisa, int $adjustmentsPaisa,
                int $unchargedFoodPaisa, int $doesntPayNetPaisa)
CloseCheckResult(bool $ok, int $actualPaisa /* cash − Σbalance */, int $expectedPaisa, int $differencePaisa /* actual − expected */)
```
Balance math (A2): `fixed.balance = carryIn + payments + ownPocket + ledger + doesntPay − charges` (fixed maps); `meals.balance` same without carryIn/doesntPay. Doesn't-pay: each request's T = the debtor's total **before any doesn't-pay**; "others" = `activeMemberIds` minus every debtor of this month; debtor gets +|T|, others −share (fixed side). Outstanding and overdue per §4.7. Overdue days = whole days from deadline to today when outstanding > 0 and today > deadline.

---

## 6. HTTP API

Base `/api`. SPA auth via Sanctum cookies: the web app calls `GET /sanctum/csrf-cookie`, then sends `X-XSRF-TOKEN`. Mess endpoints: prefix `/api/messes/{mess}`, middleware `['auth:sanctum', 'mess']` (`App\Http\Middleware\ResolveMess` binds `current_mess` / `current_member` in the container; helpers `currentMess()`, `currentMember()`).

Shapes below are the response `data`. List endpoints return `{data:[…], meta:{…}}` (Laravel API resources).

### Task C — auth, messes, members, invites, settings
| Method & path | Who | Body → Response |
|---|---|---|
| POST `/api/auth/register` | guest | `{name,email,password,password_confirmation,locale?}` → 201 `User` |
| POST `/api/auth/login` | guest | `{email,password,remember?}` → `User`; bad creds 422 |
| POST `/api/auth/logout` | auth | → 204 |
| GET `/api/auth/me` | auth | → `{user: User, memberships: Membership[]}` |
| PATCH `/api/auth/me` | auth | `{name?, locale?}` → `User` |
| POST `/api/auth/forgot-password` | guest | `{email}` → 202 |
| POST `/api/auth/reset-password` | guest | `{token,email,password,password_confirmation}` → 200 |
| GET `/api/auth/google/redirect` | guest | 302 to Google |
| GET `/api/auth/google/callback` | guest | logs in/creates user, 302 to `FRONTEND_URL/auth/callback?status=ok|error` |
| POST `/api/messes` | auth | `{name, month_start_day?, first_month_starts_on, creator_display_name, creator_opening_balance_paisa?, members?:[{display_name, opening_balance_paisa?}]}` → 201 `{mess: Mess, member: Member}`. Creator = admin + manager. Creates first month, default categories (Fixed: Rent `fixed_per_person`, Wifi `equal`, Electricity `equal`, Cook `equal`; Meals: Bazar `by_meal`), placeholder members, and `opening` ledger rows (group fixed). |
| GET `/api/messes/{mess}` | member | → `{mess: Mess, me: Member}` |
| PATCH `/api/messes/{mess}/settings` | admin | any `Mess` settings field → `Mess`. Changing meal settings mid-month only affects entries made afterwards. |
| GET `/api/messes/{mess}/members` | member | → `Member[]` (incl. archived, flag) |
| POST `/api/messes/{mess}/members` | admin,manager | `{display_name, joined_on, opening_balance_paisa?}` → 201 `Member` |
| PATCH `/api/messes/{mess}/members/{member}` | admin,manager | `{display_name?, joined_on?, left_on?}` → `Member` |
| POST `/api/messes/{mess}/members/{member}/archive` | admin,manager | → `Member`; 409 `is_admin_or_manager` |
| POST `/api/messes/{mess}/admin` | admin | `{member_id}` → `Mess` (member must have an account) |
| POST `/api/messes/{mess}/manager` | admin | `{member_id}` → `Mess` |
| POST `/api/messes/{mess}/invites` | admin,manager | `{member_id?, expires_in_days?, max_uses?}` → 201 `Invite` |
| GET `/api/messes/{mess}/invites` | admin,manager | → `Invite[]` |
| DELETE `/api/messes/{mess}/invites/{invite}` | admin,manager | → 204 (sets revoked_at) |
| GET `/api/invites/{token}` | public | → `{mess_name, member_display_name?, valid, reason?}` |
| POST `/api/invites/{token}/accept` | auth | `{display_name?}` → `{mess_id, member_id}`; 409 `invite_invalid`, `already_member` |

### Task M — months & categories
| GET `/months` | member | → `Month[]` newest first |
| GET `/months/current` | member | → `Month` (creates the open month for today if missing; boundaries from `month_start_day`) |
| GET `/months/{month}` | member | → `Month` |
| GET/POST `/categories`, PATCH/DELETE `/categories/{category}` | GET member, write manager | `Category`; delete = archive; 409 `by_meal_not_allowed_in_fixed` |
Service `App\Services\Month\Calendar`: `monthFor(Mess, date): Month` (open month containing date or creates it), `assignMonth(Mess, date): array{month: Month, is_late: bool}` (closed → current open month, late), `currentMonth(Mess): Month`.

### Task G — payments & cash
| GET `/payments?month_id&member_id` | member | → `Payment[]` |
| POST `/payments` | manager | `{member_id, group, amount_paisa, paid_on, note?}` → 201 `Payment`; month = month of paid_on via Calendar |
| PATCH/DELETE `/payments/{payment}` | manager | open month only, 409 `month_closed` |
| GET `/cash` | member | → `{pool_balance_paisa, manager_member_id}` |
Service `App\Services\CashPool\CashPool::balance(Mess): int`.

### Task E — expenses
| GET `/expenses?month_id&status&member_id&category_id` | member | → `Expense[]` |
| POST `/expenses` | member | `{category_id, amount_paisa, spent_on, note?, paid_by, paid_by_member_id?}` → 201 `{expense: Expense, warnings: string[]}`. Members may only use `paid_by=member` with themselves; manager may record anything. Cash short → converted to manager's own money, warning `short_cash_converted`. Status `pending` if mess.approval_required and creator is not manager. |
| PATCH/DELETE `/expenses/{expense}` | owner while pending (or while month open if approval off); manager any time month is open | 409 `month_closed`, `already_approved` |
| POST `/expenses/{expense}/approve` / `/reject {reason}` | manager | → `Expense` |

### Task F — meals
| GET `/meals?month_id` | member | → `{month_id, style, entries: MealEntry[], totals: {member_id: {meals_centi, guest_meals_centi}}}` |
| PUT `/meals` | per `meal_entry_by` (self = own row; manager always) | `{member_id, entry_date, meals_centi? , breakfast?, lunch?, dinner?, guest_meals_centi?}` → `MealEntry` (upsert). bld_ticks computes meals_centi from mess weights. month_total: entry_date = month.starts_on. 409 `meal_tracking_off`, `month_closed` |
| PUT `/meals/bulk` | manager | `{entries:[…]}` → `MealEntry[]` |

### Task H — monthly setup (fixed bills, overrides, deposits, deadlines)
| GET `/months/{month}/setup` | member | → `{month: Month, bills: Bill[], member_settings: MemberMonthSetting[]}`; each `Bill` includes `shares` and `unallocated_paisa` from `BillSplitter` |
| PATCH `/months/{month}/setup` | manager | `{fixed_deadline?, deposit_deadline?, deposit_paisa?}` → `Month` |
| PUT `/months/{month}/bills/{category}` | manager | `{amount_paisa? (fixed group only), overrides:[{member_id, amount_paisa}]}` → `Bill` |
| POST `/months/{month}/bills/{category}/spread` | manager | spreads unallocated over non-overridden… (equal LR over the others' current shares) → `Bill` |
| POST `/months/{month}/bills/{category}/accept` | manager | sets unallocated_accepted → `Bill` |
| PUT `/months/{month}/members/{member}/settings` | manager | `{deposit_paisa?, min_meals_centi?}` → `MemberMonthSetting` |
All writes 409 `month_closed` on closed months.

### Task J — live balances (read-only)
Service `App\Services\Balance\MonthBalanceService::forMonth(Month): BalanceResult` (loads rows → `ChargeCalculator` + `BalanceCalculator`; closed months read the stored ledger).
| GET `/dashboard?month_id` | member | → `Dashboard` (totals, meal rate, cash, per-member rows with fixed/meals bill, balance, outstanding, overdue days, manager personal balance) |
| GET `/statements/{member}?month_id` | member | → `Statement` (lines: last month due, each fixed bill share, meal charge, other meals categories, rounding, payments, own-pocket expenses, adjustments, doesn't-pay) |
| GET `/history` | member | → per month totals |
Shapes (exact TS in `web/src/lib/api/contract.ts`, fixtures `Dashboard`/`Statement`/`History`): `Dashboard {month: MonthInfo, today, totals, cash_pool_paisa, manager_member_id, manager_balance_paisa, members: DashboardRow[]}`; `Statement {member, month, today, carry_in_paisa, lines: StatementLine[], fixed/meals_balance_paisa, total_paisa, fixed_outstanding_paisa, deposit_required/outstanding_paisa, fixed/deposit_overdue_days}`; `StatementLine {kind, group, label, date, amount_paisa}`; `/history` → `HistoryRow[]` newest first. Default month (no `month_id`): the month containing today, else newest open, else newest — never creates one. Closed months: overdue judged at `closed_at`; charges come from stored `charge`/`rounding` rows. `cash_pool_paisa` is the current pool regardless of the month viewed.

### Task K — month lifecycle
| GET `/months/{month}/close-check` | manager | → `{can_close, blocks: [{code, data}]}` codes: `pending_expenses`, `zero_meals_unresolved`, `unallocated`, `doesnt_pay_mismatch`, `cash_mismatch`, `previous_month_open` |
| POST `/months/{month}/close` | manager | `{zero_meal_resolution?}` → `Month`; writes ledger rows; opens next month |
| GET `/months/{month}/reopen-preview` | manager | → per-member before/after |
| POST `/months/{month}/reopen` | manager | 409 `not_latest_closed`, `payout_after_close` |
| GET/POST `/adjustments` | GET member, POST manager | `{member_id, group, amount_paisa (signed), note}` |
| POST `/months/{month}/doesnt-pay` | manager | `{member_id, mode, manual?:[{member_id, amount_paisa}]}` → `Recoverable` (pending) |
| DELETE `/months/{month}/doesnt-pay/{recoverable}` | manager | undo before close |
| GET `/recoverables` | member | |
| POST `/recoverables/{recoverable}/repayments` | manager | `{amount_paisa, paid_on}` |
| POST `/members/{member}/final-settlement` | manager | `{amount_paisa, paid_on}`; ≤ member credit and ≤ cash; then archive allowed. 409 `exceeds_credit`, `exceeds_cash` |
As built (K): all responses wrapped in `data`; TS `CloseCheck`, `CloseBlock`, `ReopenPreview`, `Adjustment`, `SettlementResult` in `contract.ts` (fixtures of the same names). Doesn't-pay `mode`: `equal|by_meals|manual`. Close 409 `close_blocked` (+`blocks`). Reopen blocks: `month_not_closed`, `not_latest_closed`, `payout_after_close`, `archive_after_close` (member archived after close), `recoverable_repaid`; reopen is allowed when the next month already has data (it stays open, its close is blocked by `previous_month_open`); an empty, last next month is deleted. Other 409 codes: `month_closed`, `member_not_active`, `already_doesnt_pay`, `not_pending`, `recoverable_not_open`, `exceeds_outstanding`, `exceeds_credit`, `exceeds_cash`, `balances_changed` (safety net). Repayments are credited LR over each member's *remaining* share. Adjustments land in `Calendar::currentMonth`. GET `/recoverables` hides `undone` unless `status=undone`.

### Task L — export
POST `/exports {type, month_id, member_id?}` (member) → 202 `Export`; GET `/exports/{export}` → `Export`; GET `/exports/{export}/download` → xlsx. Job receives `mess_id` explicitly.

### Task N — audit
GET `/audit?event&member_id&from&to&page` (member) → paginated `AuditLog[]`.

### Resource shapes (TS names in `contract.ts`)
- `User {id, name, email, locale, has_password, has_google}`
- `Membership {mess_id, mess_name, member_id, is_admin, is_manager, archived}`
- `Mess {id, name, currency, month_start_day, admin_member_id, manager_member_id, approval_required, rounding_mode, meal_tracking, meal_entry_by, breakfast_weight_centi, lunch_weight_centi, dinner_weight_centi, min_meals_enabled, min_meals_centi, min_payable_enabled, min_payable_paisa, deposit_paisa, fixed_due_day_offset, deposit_due_day_offset}`
- `Member {id, display_name, user_id, has_account, is_admin, is_manager, joined_on, left_on, archived_at}`
- `Invite {id, token, url, member_id, expires_at, max_uses, uses, revoked_at}`
- `Month {id, starts_on, ends_on, status, fixed_deadline, deposit_deadline, deposit_paisa, zero_meal_resolution, closed_at}`
- `Category {id, group, name, split_type, sort, is_default, archived_at}`
- `Expense {id, month_id, category_id, amount_paisa, spent_on, note, paid_by, paid_by_member_id, status, is_late, short_cash_converted, is_self_recorded, created_by_member_id, approved_by_member_id, created_at}`
- `MealEntry {id, member_id, entry_date, breakfast, lunch, dinner, meals_centi, guest_meals_centi}`
- `Payment {id, month_id, member_id, group, amount_paisa, paid_on, note, received_by_member_id}`
- `Bill {category_id, group, split_type, amount_paisa, overrides:[{member_id, amount_paisa}], shares:{[member_id]: paisa}, unallocated_paisa, unallocated_accepted}`
- `MemberMonthSetting {member_id, deposit_paisa, min_meals_centi}`
- `Recoverable {id, month_id, debtor_member_id, mode, status, amount_paisa, repaid_paisa, shares:[{member_id, amount_paisa, manual_amount_paisa}]}`
- `AuditLog {id, event, member_id, subject_type, subject_id, before, after, created_at}`
- `Export {id, type, status, created_at, download_url}`

---

## 7. Audit
`App\Services\Audit\AuditLogger::log(string $event, ?Model $subject, array $before = [], array $after = [], array $meta = [])` — actor and mess taken from the container. Models with the `Auditable` trait log `<model>.created|updated|deleted` automatically. Explicit events: `month.closed`, `month.reopened`, `doesnt_pay.set`, `doesnt_pay.undone`, `settings.updated`, `role.admin_transferred`, `role.manager_assigned`, `member.archived`, `payout.final`, `invite.accepted`, `expense.approved`, `expense.rejected`.

---

## 8. Web conventions (`/web`)
- Feature code in `src/features/<feature>/` (components, hooks `api.ts`, zod schemas). Pages in `src/app/(app)/[mess]/<feature>/`.
- Nav: each feature exports `src/features/<feature>/nav.ts` → `NavItem {key, href(messId), labelKey, icon, roles?, order}`; registered in `src/features/nav-registry.ts` (lead-owned, add a line when merging).
- i18n: `messages/{en,bn}/<feature>.json`, namespace = file name. Auto-merged; never edit another feature's file.
- Money display only via `formatMoney(paisa, locale, mode)`; never compute balances in the browser.
- API calls via `apiClient` (`src/lib/api-client`); types from `src/lib/api/contract.ts`.
- Tests: Vitest + Testing Library + MSW. `pnpm test`, `pnpm build` must pass.
- Test helpers (lead-owned): `renderWithProviders(ui, {locale?, messId?})` in `src/test/render.tsx`; MSW `server` in `src/test/msw/server.ts` (add handlers per test with `server.use`; unhandled requests fail).
- Mess context: `useMess()` from `src/lib/mess/mess-context.tsx` → `{messId}`. The `(app)/[mess]/layout.tsx` provides it and renders `AppShell` (task D).
- Locale: `NEXT_LOCALE` cookie (`en`|`bn`); server reads it in `src/i18n/request.ts`. Next 16: read `web/AGENTS.md` and `node_modules/next/dist/docs/` before writing Next code (e.g. `params` is a Promise; `middleware` is now `proxy`).
- HeroUI is **v3** (compound components, no Provider, styles via `@import "@heroui/styles"`). Check `node_modules/@heroui/react` types; don't assume v2 APIs.
- Contract drift: every resource in §6 has `docs/contract-fixtures/<Name>.json`. Web: `src/lib/api/contract.test.ts`. API: call `expectContractShape($json, '<Name>')` in your feature test for every resource you return.
