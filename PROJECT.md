# Mess Hisab — Project Spec & Decision Log

> Read this first in any new session. It records what we are building, every decision made, and why.
> Status: **spec approved, nothing built yet.** Next step: detailed build plan, then implementation.
> Last updated: 2026-11-02.

---

## 1. What this is

A multi-tenant web app to run the accounting ("hisab") of a shared house / hostel / **mess** (Bangladesh style).
Anyone can create their own mess and invite members. It replaces the Google Form + Excel sheet
(`Meser hisab (Responses).xlsx` in this folder) that the owner's 3-person mess uses today.

The user's own mess has 3 members (Shuvendu, Dipta, Nilu). **"Nilu" is just a placeholder** — the app is for everyone.

### The original Excel sheet (source of the requirements)
- Sheet `Form Responses 1` = *this month* (empty so far), sheet `Sheet1` = *last month* (October 2026, 14,582 total).
- Google Form fields: Timestamp, Name, Amount. Members log what they spent.
- Daily part: `TOTAL = SUM(amounts)`, `AVG = TOTAL/3`, `PAID = SUMIF(name)`, `DUE = AVG - PAID`.
  Last month: Shuvendu paid 3,450 (due 1,411), Dipta paid 8,372 (owed 3,511), Nilu paid 2,760 (due 2,101).
- Column `IF Nilu Dont Pay`: Nilu's due is split between the other two (Shuvendu 2,461, Dipta -2,461).
- Monthly part: `Basa Bhara` (rent, per person: 2000/3500/2000) + `Last Month Due` (carried over: 1410/-3510/2100)
  + one third of `Others` (Didi 1500, Wifi 1000, Electricity 1565 = 4065) = `Total with others`; minus `PAID` = `DUE`.
- Google Form is **fully replaced** by the app. No Excel import (opening balances are typed in instead).

---

## 2. Accounts, roles, access

- Anyone signs up (email + password, Google sign-in) and **creates a mess**. Members join by **invite link**.
  Everyone has their own login. One person can belong to several messes.
- **Roles**
  - **Admin** — the creator; transferable. Mess settings, members, assigns the manager.
  - **Manager (cashier)** — manages everything money-related: edits/deletes any entry, records payments, closes the month, holds the cash. Can be the same person as Admin. The manager is also a normal member.
  - **Member** — adds own expenses, (optionally) own meals, views everything.
- **Visibility:** members see everything in the mess, **read-only** (all expenses, meals, everyone's dues). *Why: builds trust and makes the "X doesn't pay" split easy to explain.* (An earlier idea of a per-mess "see only own numbers" setting was dropped.)
- **Strict data isolation between messes** (every table scoped by `mess_id`).
- **Languages:** English + Bangla, switchable per user (incl. Bangla numerals/dates).
- Each mess sets its own **month start day (1–28)** (default 1st). Some messes run e.g. 10th→9th.

---

## 3. The two groups of costs

There are exactly **two groups**, each with subcategories:

### A. FIXED group
- Subcategories: Basa Bhara (rent), Wifi, Electricity, cook/Didi, anything else fixed.
- Decided by the manager **at the start of the month**.
- **One single deadline for the whole group** (not per subcategory). Members pay the manager.
- Subcategory split types: **equal** or **fixed amount per person** (e.g. rent 2000/3500/2000). **Not by meal count** — a cost that follows meals belongs in the Meals group (user decision, 2026-11-02).

### B. MEALS group
- Bazar / food, **entered by members through the month**.
- Has a **must-deposit** (one amount per mess, same for everyone, with its own deadline) for bulk purchasing.
- Subcategory split types: equal, fixed amount per person, or by meal count; the meal rate (§5) uses only subcategories split **by meal count**; other Meals subcategories are charged as written, outside the rate.
- Bazar is *always* a Meals cost (a member can only buy bazar → counted as meals, with "paid by X").

### Payments
- Members pay the **manager**. The manager records the payment and **picks the group** (Fixed or Meals) it is for.
  *Why: overdue is tracked per group because each group has its own deadline.*
- **Overdue** is shown to the manager and the member (red badge, days late). **No late fee** (decided).
- There is **no payment-method field** and **no member-to-member transfers** (both explicitly declined).

### Credits and dues across groups (decided with a worked example)
- A credit in **either** group automatically reduces a due in the **other** group. Each person effectively has one running balance; the screen still shows the Fixed bill and Meals bill separately; overdue is computed after credit is applied.
- Example: X spends 1,500 own money on bazar, Meals bill is 800 → +700 credit. If X still owes 2,300 Fixed, Fixed due becomes 1,600 automatically.
- *Opus review had recommended keeping groups separate with a manual "move credit" entry; the user chose automatic netting.*

---

## 4. Expenses, paid-by, cash pool

- Every expense: amount, date, category/subcategory, note, and a **required "paid by"**:
  - a **member** (own pocket → that member is owed it back), or
  - **mess cash** (the manager's pool).
  *Why: without it, own-money and cash-pool spending get double-counted.* **Both modes are supported in the same mess.**
- **Cash balance** = payments in − pool expenses − final-settlement payouts.
- **Short cash:** if the manager records a "mess cash" expense but the pool is short (e.g. buys 500 with only 200 in pool), the app **warns and records it as the manager's own money** — the mess owes the manager. Cash never goes negative.
- **Approval:** per-mess setting — expenses either count immediately or wait for manager approval.
  - Members can edit/delete their own expense **only before approval**; after that only the manager (if approval is off: until the month closes).
  - **Pending items block month close** until each is approved or rejected.
- **Full audit log** of every add/edit/delete (who, when).
- Manager's own entries are marked **"self-recorded"**, visible to admin/members; manager's personal balance is shown separately from the pool cash they hold.
- **Manager change mid-month:** the cash pool **simply follows the role automatically — no handover step.** *This was an explicit user decision made against Opus's recommendation (Opus wanted a required counted-cash handover entry because the old manager physically holds the cash). Keep as decided; revisit only if the user raises it.*
- **No regular payouts.** If X is owed 700, someone else owes 700 — it **carries into next month** (user: "carry it to next month"). The **only** payout is a **"final settlement"** for a member who is leaving (never more than what they are owed).

---

## 5. Meal counting (optional per mess)

- Entry style, per mess: (a) a **daily number per person** (e.g. 2, 2.5), (b) **breakfast/lunch/dinner ticks** with per-mess weights (e.g. breakfast = 0.5), or (c) a **month-end total only**.
- Who enters, per mess: **manager only**, or **members for themselves** (manager can always fix).
- **Guest meals:** added to the host's count and billed to the host; they **count toward the host's minimum** (user choice). Count each guest meal once only.
- **Meal rate** = (total food cost of by-meal subcategories) ÷ total meals. Person pays `meals × rate`.
- **Minimum meals** (optional): if someone ate fewer than N, the **missing meals are added to the mess total** and the rate is recalculated, so the total collected always equals the real cost.
  - Example: cost 10,000, 200 meals, Nilu ate 10, min 20 → total 210, rate 47.62, Nilu pays 952.
- **Minimum payable amount** (optional): the person pays at least X. Applied **after** minimum meals; any surplus is taken off the others in proportion to their meals. Compared against the meal charge only, never against the deposit.
- A mess can enable minimum meals, minimum payable, both, or neither.
- **Late joiners/leavers:** the manager sets the minimum **by hand** per case.
- **Zero meals with food cost > 0:** closing the month is **blocked** until the manager chooses *split equally* or *carry the cost to next month*.

### Meal deposit
- One amount per mess, same for everyone, with a due date. It is **money already paid, not a charge**. Any leftover after the food bill becomes **credit carried to next month**.
- **Mid-month joiner:** manager sets that person's deposit; default is the full amount.

---

## 6. Month lifecycle

- **Month close:** manager presses *Close month*; month locks. Each person's leftover due/credit becomes the next month's **"Last month due"**, **calculated live from the full ledger history** (not a stored snapshot). *Why: reopening can't leave stale carry-overs.*
- **Reopen:** only the **latest closed month** can be reopened. Older mistakes are fixed with an **adjustment entry in the current month**. Show a per-member preview of what changes; block the next month's close while the reopened month is open; block reopen if a payout/archive happened after it closed (use an adjustment instead).
- **Close is blocked** when: pending approvals exist; zero meals with food cost; hand-edited shares don't add up; cash doesn't match member balances by the exact identity in docs/CONTRACT.md §3.
- **Carry-over display:** last month's leftover due/credit appears on the **Fixed** side as its own **"Last month due"** line, due by the Fixed deadline (user decision, 2026-11-02).
- **Which month an entry belongs to:** the month of the **expense date** if that month is still open; otherwise the **current month**, marked as a *late entry*.
- **Unallocated shares:** if the manager hand-edits a person's equal/fixed charge so shares don't add up to the bill, show "unallocated: X taka" and offer to spread it over the others; close blocked until resolved/accepted.
- **Opening balance:** typed per member when the mess is created (becomes the first "Last month due").

### "If X doesn't pay" toggle (generalised from the Excel column)
- Works for **any** member, **manager only** can press it (assumed default), **only before close**, audit-logged.
- X's balance goes to 0; X's due is split among the others (charged to them). The manager **chooses how to split it: equally, by meals, or typed amounts per person**; the chosen shares are saved (user decision, 2026-11-02). X's debt stays on record as **"recoverable"** (lives across months as an open receivable). If X pays later, that money is credited back to the others in the same split (including archived members, shown as "payable to ex-member" until settled).

### Members joining / leaving
- Manager sets each member's start/end date. Meal-based costs adjust from meal counts; for equal/fixed charges the manager edits that person's amount for the month.
- **Leaving:** credit is paid out via *final settlement*; debt stays on record; member is **archived, never deleted**.

---

## 7. Money & rounding rules

- Store all money as **whole paisa in integer columns**. Never floats.
- Split using **largest-remainder** so shares always add up exactly to the total.
- **Rounding is a per-mess setting:** (1) whole taka with a visible rounding line, (2) **round up** (user-requested, e.g. 521.15 → 522), (3) two decimals.
- **Round-up extra stays in mess cash as a visible "rounding extra" line** (user decision, 2026-11-02, replacing the earlier "ignore it"). Nobody gets it back; the close check counts it exactly, with no tolerance.
- All balance math happens on the **server**; the frontend only displays.

### Worked example (verified by Opus review)
4 members A/B/C/D. Food 8,000: A paid 3,000 own pocket, 5,000 from mess cash. Meals 60/50/40/10, minimum 20 → D short by 10 → total 170, rate 47.0588.
Charges A 2,823.53 / B 2,352.94 / C 1,882.35 / D 941.18 = 8,000. Deposit 2,500 each, all paid.
Balances: A +2,676.47, B +147.06, C +617.65, D +1,558.82 (sum 5,000 = cash 10,000 − 5,000). Whole-taka: 2,824/2,353/1,882/941.

### Worked example (Fixed + Meals, shared with the user)
3 members X/Y/Z. Fixed: rent X 2000, Y 3500, Z 2000 + wifi 900 equal (300 each). Meals eaten X20 Y10 Z20 = 50; food cost 2,000 (X bought 1,500 own pocket, manager 500 from cash) → rate 40.
Bills: X 2,300 + 800; Y 3,800 + 400; Z 2,300 + 800. X's Meals balance = 1,500 − 800 = +700 credit; Y owes 400 Meals.

---

## 8. Screens / features list

- Dashboard (month total, who owes what, cash balance, overdue).
- Expense entry (mobile-friendly), expense list with approval.
- Meal grid / meal entry (style per mess), guest meals.
- Fixed charges setup per month (subcategories, splits, per-person amounts, deadline).
- Payments (manager records, picks group), overdue view.
- Personal statement per member; month history.
- Month close / reopen flow with all block checks.
- Members (invite link, dates, archive), roles, manager change.
- Mess settings: name, currency, month start day, manager, approval on/off, rounding mode, meal style/weights, minimums, deposit amount & deadline, who enters meals.
- Export: **Excel only** (PDF dropped).
- Audit log view.

**Explicitly NOT in v1 / dropped:** member-to-member transfers, payment-method field, Excel import, PDF export, notifications/reminders, receipt photos, unequal-share adjustments beyond manual edits, Android app (later, separate), late fees, regular payouts.

---

## 9. Scope decision

- The user chose **everything above in v1** ("Everything in the spec from day one"), despite Opus recommending a smaller v1 (one meal-entry style, one minimum rule, manager-only meals, no approval workflow, PDF cut, etc.). Do not re-litigate; but build in the order in §11 so the money core is correct first.

---

## 10. Tech stack (decided + open)

**Decided by the user:** Laravel backend (REST API) + Next.js frontend, UI library NextUI (now renamed **HeroUI**); later a **PWA**; **Android app is out of scope** for this plan; **every page must be responsive** (phone, tablet, large screen).

**My recommendations (accepted unless the user says otherwise):**
- Laravel + Sanctum (cookies for the web app now; personal access tokens ready for Android later). Email/password + Google sign-in.
- Money engine = plain PHP service classes with heavy unit tests (the worked examples above are the first test cases). Ledger design: every charge/payment/expense/credit/adjustment is a row tagged with mess, member, group, month; balances are sums.
- Global `mess_id` scoping + policies for Admin/Manager/Member. Audit log on all writes. Laravel Excel (queued) for export.
- Next.js App Router + TypeScript; mostly client-rendered behind login; TanStack Query; React Hook Form + Zod; `next-intl` for English/Bangla incl. Bangla numerals; PWA via Serwist at the end.
- UI: HeroUI (matches the user's preference; mobile-friendly tables/modals/date pickers). Alternative considered: shadcn/ui (more control, bigger ecosystem, more setup).
- Responsive: mobile-first; tables become stacked cards on phones, sidebar + wide tables on large screens.
- Deploy on the user's **own VPS (a separate Hostinger account, not the one used for other work)**: Nginx, PHP-FPM, Node via PM2, database, Redis, Supervisor for queue workers. Two subdomains of one domain (`app.` and `api.`) so Sanctum cookies work.

**Decided:** Database = **PostgreSQL** (user choice, 2026-11-02).

**Decided:** Repo layout = **one folder** with `/api` (Laravel) and `/web` (Next.js) (user choice, 2026-11-02).

**OPEN:** none. All stack questions are answered; next is the detailed build plan.

---

## 11. Build order (proposed)

1. Laravel project, auth, messes, members, roles, invite links.
2. Ledger + calculation engine with tests against the worked examples (largest-remainder rounding, meal rate, minimums, doesn't-pay, carry-over).
3. Fixed & Meals categories, expenses (paid-by), meals, payments, cash pool.
4. Month close/reopen, blocks and checks, leaving members, recoverable debts.
5. Next.js screens: dashboard, statements, settings, export.
6. English/Bangla, responsive polish, then PWA.

---

## 12. Review history & remaining risks

- Two independent Opus reviews of the spec were done; their fixes are folded in above.
- Remaining known risks (user-accepted decisions): no cash handover on manager change; guest meals count toward minimum (watch for fake guest meals — consider requiring manager confirmation when members enter their own meals).
- Assumed defaults not explicitly confirmed by the user: only the manager can press "X doesn't pay"; payments apply oldest-deadline-first within a group; timezone Asia/Dhaka; reopen guards in §6.

---

## 13. How the user likes to work (preferences)

- Wants questions asked one at a time in **plain language** with a recommended option and an explicit "let me type my own answer" option; if they say they don't understand, re-explain with a concrete numeric example.
- Wants important specs checked with **Opus** (a reviewer subagent) before locking.
- Wants decisions and reasons written down so any new session has full context (this file).

---

## 14. Build decisions (Phase 0, 2026-11-02)

Technical details live in **docs/CONTRACT.md** (lead-owned). Lead defaults below are not money-changing or are implied by the spec; the user can overrule any of them.

- **Sign:** positive balance = credit (mess owes the member), negative = due. UI shows "Due 400" / "Credit 700".
- **Largest remainder tie-break:** equal fractions → lowest member id first. Negative totals: split the absolute value, then negate.
- **Ledger:** open-month charges are computed live by the engine and never stored; close writes `charge`/`rounding`/`doesnt_pay_*` rows (`source_type = month_close`) and reopen deletes exactly those. Payments and expenses stay in their own tables (no duplicate ledger rows, no stored carry rows — carry-over is derived). Types: opening, charge, rounding, adjustment, doesnt_pay_out, doesnt_pay_in, recoverable_repay, final_payout.
- **Active member in a month:** joined on/before the month's end and not left before its start. No pro-rating.
- **Archived members** can log in and see everything read-only.
- **Deposit** is a Meals-group requirement with its own deadline (overdue like a due); not a charge.
- **Meal tracking "off"** is allowed; then Meals categories use equal / fixed split only.
- **Default categories** on mess creation: Fixed — Rent (fixed per person), Wifi, Electricity, Cook (equal); Meals — Bazar (by meal).
- **Language** is stored per user (`users.locale`) and mirrored in a `NEXT_LOCALE` cookie for the web app.
- **Password reset** by email; in development mail goes to the log.
- **Google sign-in:** API redirect → callback sets the session cookie → redirects to the web app.
- **Dev setup:** PostgreSQL on port 5433, database queue and cache (no Redis yet). Laravel 13, Next.js 16, HeroUI v3, next-intl 4, Pest, Vitest + MSW.
- **Web:** Next's `cacheComponents` is off (the app is client-driven over the API; the locale comes from a cookie).
- **Contract drift check:** `docs/contract-fixtures/*.json` is checked by both the web tests and the API tests.
