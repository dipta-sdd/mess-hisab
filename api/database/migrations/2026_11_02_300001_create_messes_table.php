<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('messes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('currency', 3)->default('BDT');
            $table->unsignedSmallInteger('month_start_day')->default(1);
            $table->unsignedBigInteger('admin_member_id')->nullable(); // FK added in 300099 (circular)
            $table->unsignedBigInteger('manager_member_id')->nullable();
            $table->boolean('approval_required')->default(false);
            $table->string('rounding_mode')->default('whole_taka');
            $table->string('meal_tracking')->default('daily_number');
            $table->string('meal_entry_by')->default('manager');
            $table->integer('breakfast_weight_centi')->default(50);
            $table->integer('lunch_weight_centi')->default(100);
            $table->integer('dinner_weight_centi')->default(100);
            $table->boolean('min_meals_enabled')->default(false);
            $table->integer('min_meals_centi')->nullable();
            $table->boolean('min_payable_enabled')->default(false);
            $table->bigInteger('min_payable_paisa')->nullable();
            $table->bigInteger('deposit_paisa')->default(0);
            $table->unsignedSmallInteger('fixed_due_day_offset')->default(5);
            $table->unsignedSmallInteger('deposit_due_day_offset')->default(5);
            $table->foreignId('created_by_user_id')->constrained('users');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('messes');
    }
};
