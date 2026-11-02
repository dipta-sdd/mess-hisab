<?php

namespace App\Http\Requests\Auth;

use App\Enums\Locale;
use App\Rules\BdMobile;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'string', new BdMobile, Rule::unique('users', 'phone')],
            'email' => ['nullable', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
            'locale' => ['sometimes', 'nullable', Rule::enum(Locale::class)],
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->phone)) {
            $this->merge(['phone' => BdMobile::normalize($this->phone)]);
        }
        if (is_string($this->email)) {
            $email = strtolower(trim($this->email));
            $this->merge(['email' => $email === '' ? null : $email]);
        }
    }
}
