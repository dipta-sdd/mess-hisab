<?php

namespace App\Http\Controllers\Expense;

use App\Enums\ExpenseStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Expense\ExpenseRequest;
use App\Http\Requests\Expense\RejectExpenseRequest;
use App\Http\Resources\ExpenseResource;
use App\Models\Expense;
use App\Models\Mess;
use App\Services\Expense\ExpenseService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class ExpenseController extends Controller
{
    public function __construct(private ExpenseService $service) {}

    public function index(Request $request, Mess $mess): AnonymousResourceCollection
    {
        $data = $request->validate([
            'month_id' => ['sometimes', 'integer'],
            'status' => ['sometimes', Rule::in(ExpenseStatus::values())],
            'member_id' => ['sometimes', 'integer'],
            'category_id' => ['sometimes', 'integer'],
        ]);

        $expenses = Expense::query()
            ->when(isset($data['month_id']), fn ($q) => $q->where('month_id', $data['month_id']))
            ->when(isset($data['status']), fn ($q) => $q->where('status', $data['status']))
            ->when(isset($data['category_id']), fn ($q) => $q->where('category_id', $data['category_id']))
            // member_id: the expenses a member recorded or paid for.
            ->when(isset($data['member_id']), fn ($q) => $q->where(fn ($w) => $w
                ->where('created_by_member_id', $data['member_id'])
                ->orWhere('paid_by_member_id', $data['member_id'])))
            ->orderByDesc('spent_on')->orderByDesc('id')
            ->get();

        return ExpenseResource::collection($expenses)->additional(['meta' => ['total' => $expenses->count()]]);
    }

    public function store(ExpenseRequest $request, Mess $mess): JsonResponse
    {
        $result = $this->service->create($mess, currentMember(), $request->validated());

        return response()->json([
            'data' => [
                'expense' => (new ExpenseResource($result['expense']))->resolve($request),
                'warnings' => $result['warnings'],
            ],
        ], 201);
    }

    public function update(ExpenseRequest $request, Mess $mess, Expense $expense): ExpenseResource
    {
        return new ExpenseResource($this->service->update($mess, currentMember(), $expense, $request->validated()));
    }

    public function destroy(Mess $mess, Expense $expense): Response
    {
        $this->service->delete($mess, currentMember(), $expense);

        return response()->noContent();
    }

    public function approve(Mess $mess, Expense $expense): ExpenseResource
    {
        return new ExpenseResource($this->service->approve($mess, currentMember(), $expense));
    }

    public function reject(RejectExpenseRequest $request, Mess $mess, Expense $expense): ExpenseResource
    {
        return new ExpenseResource($this->service->reject($mess, currentMember(), $expense, $request->validated('reason')));
    }
}
