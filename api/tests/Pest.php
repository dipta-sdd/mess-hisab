<?php

use App\Models\Mess;
use App\Models\MessMember;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
|--------------------------------------------------------------------------
| Lead-owned. Feature tests get a fresh Postgres DB (RefreshDatabase).
| Unit tests are pure PHP (the billing engine never touches the DB).
|--------------------------------------------------------------------------
*/

pest()->extend(Tests\TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(Tests\TestCase::class)->in('Unit');

/**
 * Create a mess with a logged-in member in the given role and act as them.
 * $role: 'admin' | 'manager' | 'admin_manager' | 'member' | 'archived'.
 * Returns [Mess $mess, MessMember $me].
 *
 * @return array{0: Mess, 1: MessMember}
 */
function actingAsMember(string $role = 'member', ?Mess $mess = null): array
{
    $mess ??= Mess::factory()->create();

    $state = $role === 'archived' ? ['left_on' => '2026-11-15', 'archived_at' => now()] : [];
    $me = MessMember::factory()->for($mess)->create($state);

    // Make sure the mess always has an admin and a manager.
    $other = fn () => MessMember::factory()->for($mess)->create();
    $mess->admin_member_id = in_array($role, ['admin', 'admin_manager']) ? $me->id : ($mess->admin_member_id ?? $other()->id);
    $mess->manager_member_id = in_array($role, ['manager', 'admin_manager']) ? $me->id : ($mess->manager_member_id ?? $other()->id);
    $mess->save();

    test()->actingAs($me->user);

    return [$mess->fresh(), $me->fresh()];
}

/** A second, unrelated mess (with its own admin/manager) for cross-mess 404 tests. */
function otherMess(): Mess
{
    $mess = Mess::factory()->create();
    $owner = MessMember::factory()->for($mess)->create();
    $mess->update(['admin_member_id' => $owner->id, 'manager_member_id' => $owner->id]);

    return $mess->fresh();
}

/** API path inside a mess: messPath($mess, 'payments') → /api/messes/1/payments */
function messPath(Mess $mess, string $path = ''): string
{
    return '/api/messes/'.$mess->id.($path === '' ? '' : '/'.ltrim($path, '/'));
}

/** Convenience: User::factory()->create() */
function user(array $attributes = []): User
{
    return User::factory()->create($attributes);
}

/**
 * Asserts a resource's JSON has exactly the keys of docs/contract-fixtures/<name>.json
 * (the same files web/src/lib/api/contract.test.ts checks), so API and web cannot drift.
 */
function expectContractShape(array $json, string $name): void
{
    $fixture = json_decode(file_get_contents(base_path("../docs/contract-fixtures/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);
    $expected = array_keys($fixture);
    $actual = array_keys($json);
    sort($expected);
    sort($actual);

    expect($actual)->toBe($expected, "{$name} keys differ from docs/contract-fixtures/{$name}.json");
}
