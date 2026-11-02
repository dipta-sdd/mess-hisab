<?php

namespace App\Http\Requests\Auth;

use App\Rules\BdMobile;
use Illuminate\Foundation\Http\FormRequest;

/** `phone` + 6-digit `code` (password-reset verify, phone-change confirm). */
class PhoneCodeForNumberRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'phone' => ['required', 'string', new BdMobile],
            'code' => ['required', 'string', 'digits:6'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->phone)) {
            $this->merge(['phone' => BdMobile::normalize($this->phone)]);
        }
    }
}
