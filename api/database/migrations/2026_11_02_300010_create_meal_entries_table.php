<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('meal_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained();
            $table->foreignId('member_id')->constrained('mess_members');
            $table->date('entry_date');
            $table->boolean('breakfast')->nullable();
            $table->boolean('lunch')->nullable();
            $table->boolean('dinner')->nullable();
            $table->integer('meals_centi')->default(0);
            $table->integer('guest_meals_centi')->default(0);
            $table->foreignId('entered_by_member_id')->constrained('mess_members');
            $table->timestamps();
            $table->unique(['member_id', 'entry_date']);
            $table->index(['mess_id', 'month_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('meal_entries');
    }
};
