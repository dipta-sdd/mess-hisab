# Contract fixtures (lead-owned)
One sample JSON per resource in CONTRACT §6. The key set is the contract:
- web: `src/lib/api/contract.test.ts` type-checks each file against `contract.ts`.
- api: feature tests call `expectContractShape($json, 'Mess')` (tests/Pest.php) — same keys, nothing missing, nothing extra.
