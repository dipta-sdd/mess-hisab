<?php

namespace App\Support;

use App\Models\Mess;
use App\Models\MessMember;

/**
 * The mess (and acting member) the current request or job works in.
 * Set by the ResolveMess middleware for HTTP, and explicitly by queued jobs:
 *   app(MessContext::class)->set($messId);
 * While set, every BelongsToMess model is automatically scoped to it.
 */
class MessContext
{
    private ?int $messId = null;

    private ?Mess $mess = null;

    private ?MessMember $member = null;

    public function set(Mess|int $mess, ?MessMember $member = null): void
    {
        $this->mess = $mess instanceof Mess ? $mess : null;
        $this->messId = $mess instanceof Mess ? $mess->getKey() : $mess;
        $this->member = $member;
    }

    public function clear(): void
    {
        $this->messId = null;
        $this->mess = null;
        $this->member = null;
    }

    public function id(): ?int
    {
        return $this->messId;
    }

    public function mess(): ?Mess
    {
        if ($this->mess === null && $this->messId !== null) {
            $this->mess = Mess::find($this->messId);
        }

        return $this->mess;
    }

    public function member(): ?MessMember
    {
        return $this->member;
    }
}
