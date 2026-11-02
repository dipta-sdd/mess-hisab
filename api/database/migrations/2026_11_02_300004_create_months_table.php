<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('months', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('status')->default('open');
            $table->date('fixed_deadline')->nullable();
            $table->date('deposit_deadline')->nullable();
            $table->bigInteger('deposit_paisa')->default(0);
            $table->string('zero_meal_resolution')->nullable();
            $table->bigInteger('food_carry_in_paisa')->default(0);
            $table->bigInteger('food_carry_out_paisa')->default(0);
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('closed_by_member_id')->nullable()->constrained('mess_members');
            $table->timestamp('reopened_at')->nullable();
            $table->timestamps();
            $table->unique(['mess_id', 'starts_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('months');
    }
};
