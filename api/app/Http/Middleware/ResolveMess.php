<?php

namespace App\Http\Middleware;

use App\Models\Mess;
use App\Models\MessMember;
use App\Support\MessContext;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * For /api/messes/{mess}/... routes. Runs before route-model binding (see
 * bootstrap/app.php priority), so child models bound afterwards are already
 * scoped to this mess and another mess's id resolves to 404.
 * Not a member → 404. Archived member → read-only (403 on writes).
 */
class ResolveMess
{
    public function __construct(private MessContext $context) {}

    public function handle(Request $request, Closure $next): Response
    {
        $route = $request->route();
        $param = $route->parameter('mess');
        $messId = $param instanceof Mess ? $param->getKey() : (ctype_digit((string) $param) ? (int) $param : null);

        $mess = $messId ? Mess::find($messId) : null;
        $member = $mess && $request->user()
            ? MessMember::forMess($mess->id)->where('user_id', $request->user()->id)->first()
            : null;

        abort_if($member === null, 404);

        if ($member->isArchived() && ! $request->isMethodSafe()) {
            abort(403, 'Archived members have read-only access.');
        }

        $member->setRelation('mess', $mess);
        $this->context->set($mess, $member);
        $route->setParameter('mess', $mess);

        return $next($request);
    }

    public function terminate(): void
    {
        $this->context->clear();
    }
}
