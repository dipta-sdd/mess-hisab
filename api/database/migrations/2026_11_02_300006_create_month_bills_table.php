<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('month_bills', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->constrained();
            $table->bigInteger('amount_paisa')->nullable(); // required for fixed group, null for meals group
            $table->boolean('unallocated_accepted')->default(false);
            $table->timestamps();
            $table->unique(['month_id', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('month_bills');
    }
};
