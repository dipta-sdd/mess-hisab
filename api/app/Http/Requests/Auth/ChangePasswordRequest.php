<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            // A Google-only account has no password yet, so it can set one without proving an old one.
            'current_password' => [$this->user()?->password === null ? 'nullable' : 'required', 'string'],
            'password' => ['required', 'string', 'confirmed', Password::min(8)],
        ];
    }
}
