<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained();
            $table->foreignId('member_id')->constrained('mess_members');
            $table->string('group');
            $table->bigInteger('amount_paisa');
            $table->date('paid_on');
            $table->text('note')->nullable();
            $table->foreignId('received_by_member_id')->constrained('mess_members');
            $table->foreignId('created_by_member_id')->constrained('mess_members');
            $table->softDeletes();
            $table->timestamps();
            $table->index(['mess_id', 'month_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
