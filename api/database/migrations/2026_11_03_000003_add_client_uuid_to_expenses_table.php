<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            // Set by the offline queue so a retried sync can't record the same expense twice.
            $table->uuid('client_uuid')->nullable()->after('created_by_member_id');
            $table->unique(['mess_id', 'client_uuid']);
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table) {
            $table->dropUnique(['mess_id', 'client_uuid']);
            $table->dropColumn('client_uuid');
        });
    }
};
