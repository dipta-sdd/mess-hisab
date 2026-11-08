<?php

namespace App\Http\Controllers\Payment;

use App\Http\Controllers\Controller;
use App\Http\Requests\Payment\PaymentRequest;
use App\Http\Resources\PaymentResource;
use App\Models\Mess;
use App\Models\Payment;
use App\Services\Payment\PaymentMonth;
use App\Services\Sms\MemberNotifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Payments live only in `payments` (no ledger row: PROJECT.md / CONTRACT §3).
 * The model's Auditable trait writes payment.created|updated|deleted.
 */
class PaymentController extends Controller
{
    public function index(Request $request, Mess $mess): AnonymousResourceCollection
    {
        $data = $request->validate([
            'month_id' => ['sometimes', 'integer'],
            'member_id' => ['sometimes', 'integer'],
        ]);

        $payments = Payment::query()
            ->when(isset($data['month_id']), fn ($q) => $q->where('month_id', $data['month_id']))
            ->when(isset($data['member_id']), fn ($q) => $q->where('member_id', $data['member_id']))
            ->orderByDesc('paid_on')->orderByDesc('id')
            ->get();

        return PaymentResource::collection($payments)->additional(['meta' => ['total' => $payments->count()]]);
    }

    public function store(PaymentRequest $request, Mess $mess, MemberNotifier $notifier): JsonResponse
    {
        $data = $request->validated();

        $payment = DB::transaction(function () use ($data, $mess) {
            $month = PaymentMonth::for($mess, $data['paid_on']);

            return Payment::create($data + [
                'month_id' => $month->id,
                'received_by_member_id' => $mess->manager_member_id,
                'created_by_member_id' => currentMember()->id,
            ]);
        });

        $notifier->paymentRecorded($payment);

        return (new PaymentResource($payment))->response()->setStatusCode(201);
    }

    public function update(PaymentRequest $request, Mess $mess, Payment $payment, MemberNotifier $notifier): PaymentResource
    {
        $data = $request->validated();
        $before = [
            'member_id' => $payment->member_id,
            'amount_paisa' => $payment->amount_paisa,
            'paid_on' => $payment->paid_on->toDateString(),
        ];

        DB::transaction(function () use ($data, $mess, $payment) {
            PaymentMonth::assertOpen($payment->month);

            if (isset($data['paid_on'])) {
                $data['month_id'] = PaymentMonth::for($mess, $data['paid_on'])->id;
            }

            $payment->update($data);
        });

        $payment = $payment->fresh();
        if ($payment->member_id !== $before['member_id']) {
            $notifier->paymentCancelled($before['member_id'], $before['amount_paisa'], $before['paid_on']);
            $notifier->paymentRecorded($payment);
        } elseif ($payment->amount_paisa !== $before['amount_paisa'] || $payment->paid_on->toDateString() !== $before['paid_on']) {
            $notifier->paymentChanged($payment, $before);
        }

        return new PaymentResource($payment);
    }

    public function destroy(Mess $mess, Payment $payment, MemberNotifier $notifier): Response
    {
        DB::transaction(function () use ($payment) {
            PaymentMonth::assertOpen($payment->month);
            $payment->delete();
        });

        $notifier->paymentCancelled($payment->member_id, $payment->amount_paisa, $payment->paid_on);

        return response()->noContent();
    }
}
