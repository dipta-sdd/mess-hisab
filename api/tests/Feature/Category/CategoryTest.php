<?php

use App\Enums\MealTracking;
use App\Models\AuditLog;
use App\Models\Category;

it('lists active categories for any member in sort order', function (string $role) {
    [$mess] = actingAsMember($role);
    Category::factory()->for($mess)->create(['name' => 'B', 'sort' => 2]);
    Category::factory()->for($mess)->create(['name' => 'A', 'sort' => 1]);
    Category::factory()->for($mess)->create(['name' => 'Old', 'sort' => 0, 'archived_at' => now()]);
    Category::factory()->create(['name' => 'Foreign']); // another mess

    $res = $this->getJson(messPath($mess, 'categories'))->assertOk();

    expect(collect($res->json('data'))->pluck('name')->all())->toBe(['A', 'B']);
    expectContractShape($res->json('data.0'), 'Category');
})->with(['member', 'manager', 'admin', 'archived']);

it('can include archived categories', function () {
    [$mess] = actingAsMember('member');
    Category::factory()->for($mess)->create(['archived_at' => now()]);

    $this->getJson(messPath($mess, 'categories?include_archived=1'))->assertOk()->assertJsonCount(1, 'data');
    $this->getJson(messPath($mess, 'categories'))->assertOk()->assertJsonCount(0, 'data');
});

it('lets the manager create a category', function () {
    [$mess] = actingAsMember('manager');

    $res = $this->postJson(messPath($mess, 'categories'), ['group' => 'fixed', 'name' => ' Gas ', 'split_type' => 'equal'])
        ->assertCreated();

    expectContractShape($res->json('data'), 'Category');
    expect($res->json('data'))->toMatchArray(['group' => 'fixed', 'name' => 'Gas', 'split_type' => 'equal', 'is_default' => false, 'archived_at' => null]);
    expect(Category::where('mess_id', $mess->id)->where('name', 'Gas')->exists())->toBeTrue();
    expect(AuditLog::where('event', 'category.created')->count())->toBe(1);
});

it('allows by_meal in the Meals group', function () {
    [$mess] = actingAsMember('manager');
    $mess->update(['meal_tracking' => MealTracking::DailyNumber]);

    $this->postJson(messPath($mess, 'categories'), ['group' => 'meals', 'name' => 'Fish', 'split_type' => 'by_meal'])
        ->assertCreated()->assertJsonPath('data.split_type', 'by_meal');
});

it('rejects by_meal in the Fixed group with 409', function () {
    [$mess] = actingAsMember('manager');

    $this->postJson(messPath($mess, 'categories'), ['group' => 'fixed', 'name' => 'Gas', 'split_type' => 'by_meal'])
        ->assertStatus(409)->assertJsonPath('code', 'by_meal_not_allowed_in_fixed');
    expect(Category::where('name', 'Gas')->exists())->toBeFalse();
});

it('limits Meals categories to equal or fixed_per_person when meal tracking is off', function () {
    [$mess] = actingAsMember('manager');
    $mess->update(['meal_tracking' => MealTracking::Off]);

    $this->postJson(messPath($mess, 'categories'), ['group' => 'meals', 'name' => 'Fish', 'split_type' => 'by_meal'])
        ->assertUnprocessable()->assertJsonValidationErrors(['split_type']);

    foreach (['equal', 'fixed_per_person'] as $i => $split) {
        $this->postJson(messPath($mess, 'categories'), ['group' => 'meals', 'name' => "Veg $i", 'split_type' => $split])->assertCreated();
    }
});

it('validates category input', function (array $body, string $field) {
    [$mess] = actingAsMember('manager');
    Category::factory()->for($mess)->create(['group' => 'fixed', 'name' => 'Rent']);

    $this->postJson(messPath($mess, 'categories'), $body + ['group' => 'fixed', 'name' => 'Ok', 'split_type' => 'equal'])
        ->assertUnprocessable()->assertJsonValidationErrors([$field]);
})->with([
    'missing name' => [['name' => ''], 'name'],
    'long name' => [['name' => str_repeat('x', 101)], 'name'],
    'bad group' => [['group' => 'other'], 'group'],
    'bad split' => [['split_type' => 'random'], 'split_type'],
    'negative sort' => [['sort' => -1], 'sort'],
    'duplicate name' => [['name' => 'rent'], 'name'],
]);

it('requires fields on create', function () {
    [$mess] = actingAsMember('manager');

    $this->postJson(messPath($mess, 'categories'), [])->assertUnprocessable()->assertJsonValidationErrors(['group', 'name', 'split_type']);
});

it('updates name, split type and sort', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create(['group' => 'fixed', 'name' => 'Gas', 'split_type' => 'equal']);

    $res = $this->patchJson(messPath($mess, "categories/{$category->id}"), ['name' => 'Gas bill', 'split_type' => 'fixed_per_person', 'sort' => 9])
        ->assertOk();

    expectContractShape($res->json('data'), 'Category');
    expect($res->json('data'))->toMatchArray(['name' => 'Gas bill', 'split_type' => 'fixed_per_person', 'sort' => 9]);
});

it('allows keeping a category name on update', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create(['name' => 'Gas']);

    $this->patchJson(messPath($mess, "categories/{$category->id}"), ['name' => 'Gas'])->assertOk();
});

it('refuses by_meal on a Fixed category (409) and group changes (422)', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create(['group' => 'fixed', 'split_type' => 'equal']);
    $url = messPath($mess, "categories/{$category->id}");

    $this->patchJson($url, ['split_type' => 'by_meal'])->assertStatus(409)->assertJsonPath('code', 'by_meal_not_allowed_in_fixed');
    $this->patchJson($url, ['group' => 'meals'])->assertUnprocessable()->assertJsonValidationErrors(['group']);
    expect($category->fresh()->split_type->value)->toBe('equal');
});

it('applies the meal tracking rule on update', function () {
    [$mess] = actingAsMember('manager');
    $mess->update(['meal_tracking' => MealTracking::Off]);
    $category = Category::factory()->for($mess)->meals(\App\Enums\SplitType::Equal)->create();

    $this->patchJson(messPath($mess, "categories/{$category->id}"), ['split_type' => 'by_meal'])
        ->assertUnprocessable()->assertJsonValidationErrors(['split_type']);
});

it('rejects a bad update', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create();

    $this->patchJson(messPath($mess, "categories/{$category->id}"), ['name' => '', 'split_type' => 'x'])
        ->assertUnprocessable()->assertJsonValidationErrors(['name', 'split_type']);
});

it('archives on delete and keeps the row', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create();

    $res = $this->deleteJson(messPath($mess, "categories/{$category->id}"))->assertOk();

    expectContractShape($res->json('data'), 'Category');
    expect($res->json('data.archived_at'))->not->toBeNull()
        ->and(Category::find($category->id)->archived_at)->not->toBeNull();

    $this->deleteJson(messPath($mess, "categories/{$category->id}"))->assertOk(); // idempotent
});

it('refuses to edit an archived category', function () {
    [$mess] = actingAsMember('manager');
    $category = Category::factory()->for($mess)->create(['archived_at' => now()]);

    $this->patchJson(messPath($mess, "categories/{$category->id}"), ['name' => 'X'])
        ->assertStatus(409)->assertJsonPath('code', 'category_archived');
});

it('lets an archived name be reused', function () {
    [$mess] = actingAsMember('manager');
    Category::factory()->for($mess)->create(['group' => 'fixed', 'name' => 'Gas', 'archived_at' => now()]);

    $this->postJson(messPath($mess, 'categories'), ['group' => 'fixed', 'name' => 'Gas', 'split_type' => 'equal'])->assertCreated();
});

it('returns 404 for another mess category and for non-members', function () {
    [$mess] = actingAsMember('manager');
    $other = otherMess();
    $foreign = Category::factory()->for($other)->create();

    $this->patchJson(messPath($mess, "categories/{$foreign->id}"), ['name' => 'X'])->assertNotFound();
    $this->deleteJson(messPath($mess, "categories/{$foreign->id}"))->assertNotFound();
    $this->getJson(messPath($other, 'categories'))->assertNotFound();
    $this->postJson(messPath($other, 'categories'), ['group' => 'fixed', 'name' => 'X', 'split_type' => 'equal'])->assertNotFound();
    expect($foreign->fresh()->name)->toBe($foreign->name);
});

it('forbids everyone but the manager from writing', function (string $role) {
    [$mess] = actingAsMember($role);
    $category = Category::factory()->for($mess)->create();

    $this->postJson(messPath($mess, 'categories'), ['group' => 'fixed', 'name' => 'X', 'split_type' => 'equal'])->assertForbidden();
    $this->patchJson(messPath($mess, "categories/{$category->id}"), ['name' => 'Y'])->assertForbidden();
    $this->deleteJson(messPath($mess, "categories/{$category->id}"))->assertForbidden();
    expect($category->fresh()->archived_at)->toBeNull();
})->with(['member', 'admin', 'archived']);

it('lets an admin who is also the manager write', function () {
    [$mess] = actingAsMember('admin_manager');

    $this->postJson(messPath($mess, 'categories'), ['group' => 'fixed', 'name' => 'X', 'split_type' => 'equal'])->assertCreated();
});
