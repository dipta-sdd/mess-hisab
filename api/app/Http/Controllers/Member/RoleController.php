<?php

namespace App\Http\Controllers\Member;

use App\Http\Controllers\Controller;
use App\Http\Requests\Member\MemberRoleRequest;
use App\Http\Resources\MessResource;
use App\Models\Mess;
use App\Services\Audit\AuditLogger;

class RoleController extends Controller
{
    public function transferAdmin(MemberRoleRequest $request, Mess $mess, AuditLogger $audit): MessResource
    {
        return $this->assign($mess, 'admin_member_id', (int) $request->validated('member_id'), 'role.admin_transferred', $audit);
    }

    public function assignManager(MemberRoleRequest $request, Mess $mess, AuditLogger $audit): MessResource
    {
        return $this->assign($mess, 'manager_member_id', (int) $request->validated('member_id'), 'role.manager_assigned', $audit);
    }

    private function assign(Mess $mess, string $column, int $memberId, string $event, AuditLogger $audit): MessResource
    {
        $previous = $mess->{$column} === null ? null : (int) $mess->{$column};

        if ($previous !== $memberId) {
            $mess->{$column} = $memberId;
            Mess::withoutEvents(fn () => $mess->save());
            $audit->log($event, $mess, [$column => $previous], [$column => $memberId]);
        }

        return new MessResource($mess->fresh());
    }
}
