<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('member_month_settings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained()->cascadeOnDelete();
            $table->foreignId('member_id')->constrained('mess_members');
            $table->bigInteger('deposit_paisa')->nullable();
            $table->integer('min_meals_centi')->nullable();
            $table->timestamps();
            $table->unique(['month_id', 'member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('member_month_settings');
    }
};
