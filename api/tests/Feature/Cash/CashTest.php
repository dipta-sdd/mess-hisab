<?php

use App\Models\MessMember;
use App\Models\Month;
use App\Models\Payment;

it('shows the pool and manager to any member', function () {
    [$mess] = actingAsMember('member');
    $month = Month::factory()->create(['mess_id' => $mess->id]);
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 30000]);
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 20000]);

    $res = $this->getJson(messPath($mess, 'cash'))->assertOk();

    expect($res->json('data'))->toBe(['pool_balance_paisa' => 50000, 'manager_member_id' => $mess->manager_member_id]);
});

it('keeps the pool with the mess when the manager changes', function () {
    [$mess] = actingAsMember('member');
    $month = Month::factory()->create(['mess_id' => $mess->id]);
    Payment::factory()->create(['mess_id' => $mess->id, 'month_id' => $month->id, 'amount_paisa' => 40000]);
    $new = MessMember::factory()->for($mess)->create();
    $mess->update(['manager_member_id' => $new->id]);

    $this->getJson(messPath($mess, 'cash'))->assertOk()
        ->assertJsonPath('data.pool_balance_paisa', 40000)->assertJsonPath('data.manager_member_id', $new->id);
});

it('does not leak other mess cash and returns 404 for it', function () {
    [$mess] = actingAsMember('member');
    $foreign = otherMess();
    Payment::factory()->create(['mess_id' => $foreign->id, 'amount_paisa' => 99999]);

    $this->getJson(messPath($mess, 'cash'))->assertOk()->assertJsonPath('data.pool_balance_paisa', 0);
    $this->getJson(messPath($foreign, 'cash'))->assertNotFound();
});

it('lets archived members read it', function () {
    [$mess] = actingAsMember('archived');
    $this->getJson(messPath($mess, 'cash'))->assertOk();
});
