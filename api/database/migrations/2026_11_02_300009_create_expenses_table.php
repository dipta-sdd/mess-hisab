<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained();
            $table->foreignId('category_id')->constrained();
            $table->bigInteger('amount_paisa');
            $table->date('spent_on');
            $table->text('note')->nullable();
            $table->string('paid_by');
            $table->foreignId('paid_by_member_id')->nullable()->constrained('mess_members');
            $table->string('status')->default('approved');
            $table->foreignId('approved_by_member_id')->nullable()->constrained('mess_members');
            $table->timestamp('approved_at')->nullable();
            $table->text('rejected_reason')->nullable();
            $table->boolean('is_late')->default(false);
            $table->boolean('short_cash_converted')->default(false);
            $table->boolean('is_self_recorded')->default(false);
            $table->foreignId('created_by_member_id')->constrained('mess_members');
            $table->softDeletes();
            $table->timestamps();
            $table->index(['mess_id', 'month_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};
