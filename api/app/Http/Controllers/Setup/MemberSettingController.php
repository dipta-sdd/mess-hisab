<?php

namespace App\Http\Controllers\Setup;

use App\Http\Controllers\Controller;
use App\Http\Requests\Setup\UpdateMemberSettingRequest;
use App\Http\Resources\MemberMonthSettingResource;
use App\Models\Mess;
use App\Models\MessMember;
use App\Models\Month;
use App\Services\Setup\MonthSetup;

class MemberSettingController extends Controller
{
    public function update(UpdateMemberSettingRequest $request, Mess $mess, Month $month, MessMember $member, MonthSetup $setup): MemberMonthSettingResource
    {
        return new MemberMonthSettingResource($setup->updateMemberSettings($month, $member, $request->validated()));
    }
}
