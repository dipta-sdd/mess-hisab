<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ledger_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->foreignId('month_id')->constrained();
            $table->foreignId('member_id')->nullable()->constrained('mess_members');
            $table->string('group')->nullable();
            $table->string('type');
            $table->bigInteger('amount_paisa'); // signed, member's view: + credit, − due
            $table->text('note')->nullable();
            $table->nullableMorphs('source');
            $table->jsonb('meta')->nullable();
            $table->foreignId('created_by_member_id')->nullable()->constrained('mess_members');
            $table->timestamp('created_at')->nullable();
            $table->index(['mess_id', 'month_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ledger_entries');
    }
};
