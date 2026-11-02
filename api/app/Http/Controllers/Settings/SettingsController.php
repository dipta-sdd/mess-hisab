<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\UpdateSettingsRequest;
use App\Http\Resources\MessResource;
use App\Models\Mess;
use App\Services\Audit\AuditLogger;

class SettingsController extends Controller
{
    public function update(UpdateSettingsRequest $request, Mess $mess, AuditLogger $audit): MessResource
    {
        $input = $request->safe()->only(UpdateSettingsRequest::FIELDS);

        $mess->fill($input);
        $changed = array_keys($mess->getDirty());

        if ($changed !== []) {
            $before = array_intersect_key($mess->getRawOriginal(), array_flip($changed));
            // Explicit settings.updated event replaces the generic mess.updated one.
            Mess::withoutEvents(fn () => $mess->save());
            $mess = $mess->fresh();
            $audit->log('settings.updated', $mess, $before, array_intersect_key($mess->getAttributes(), array_flip($changed)));
        }

        return new MessResource($mess);
    }
}
