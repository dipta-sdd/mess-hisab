<?php

namespace App\Http\Requests\Auth;

use App\Rules\BdMobile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ChangePhoneRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return ['phone' => ['required', 'string', new BdMobile, Rule::unique('users', 'phone')]];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->phone)) {
            $this->merge(['phone' => BdMobile::normalize($this->phone)]);
        }
    }
}
