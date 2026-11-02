<?php

use App\Models\Mess;
use App\Models\MessMember;
use App\Support\MessContext;

if (! function_exists('currentMess')) {
    function currentMess(): ?Mess
    {
        return app(MessContext::class)->mess();
    }
}

if (! function_exists('currentMember')) {
    function currentMember(): ?MessMember
    {
        return app(MessContext::class)->member();
    }
}
