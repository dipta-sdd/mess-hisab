<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mess_id')->constrained()->cascadeOnDelete();
            $table->string('group');
            $table->string('name');
            $table->string('split_type');
            $table->integer('sort')->default(0);
            $table->boolean('is_default')->default(false);
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });
        DB::statement("ALTER TABLE categories ADD CONSTRAINT categories_by_meal_only_meals CHECK (split_type <> 'by_meal' OR \"group\" = 'meals')");
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
