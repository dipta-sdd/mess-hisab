<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('messes', function (Blueprint $table) {
            $table->foreign('admin_member_id')->references('id')->on('mess_members')->nullOnDelete();
            $table->foreign('manager_member_id')->references('id')->on('mess_members')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('messes', function (Blueprint $table) {
            $table->dropForeign(['admin_member_id']);
            $table->dropForeign(['manager_member_id']);
        });
    }
};
