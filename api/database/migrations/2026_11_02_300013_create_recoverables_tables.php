<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('recoverables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained();
            $table->foreignId('debtor_member_id')->constrained('mess_members');
            $table->string('mode');
            $table->string('status')->default('pending');
            $table->bigInteger('amount_paisa')->nullable();
            $table->bigInteger('repaid_paisa')->default(0);
            $table->foreignId('created_by_member_id')->constrained('mess_members');
            $table->timestamp('undone_at')->nullable();
            $table->timestamps();
        });
        Schema::create('recoverable_shares', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('recoverable_id')->constrained()->cascadeOnDelete();
            $table->foreignId('member_id')->constrained('mess_members');
            $table->bigInteger('manual_amount_paisa')->nullable();
            $table->bigInteger('amount_paisa')->nullable();
            $table->timestamps();
            $table->unique(['recoverable_id', 'member_id']);
        });
        Schema::create('recoverable_repayments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('recoverable_id')->constrained();
            $table->foreignId('month_id')->constrained();
            $table->bigInteger('amount_paisa');
            $table->date('paid_on');
            $table->foreignId('created_by_member_id')->constrained('mess_members');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('recoverable_repayments');
        Schema::dropIfExists('recoverable_shares');
        Schema::dropIfExists('recoverables');
    }
};
