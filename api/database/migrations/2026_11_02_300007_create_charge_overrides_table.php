<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('charge_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained();
            $table->foreignId('member_id')->constrained('mess_members');
            $table->bigInteger('amount_paisa');
            $table->timestamps();
            $table->unique(['month_id', 'category_id', 'member_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('charge_overrides');
    }
};
