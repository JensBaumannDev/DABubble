import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, buildPasswordValidators, passwordsMatchValidator } from './password.validators';

describe('password validators', () => {
  it('builds validators with required and minimum length', () => {
    const control = new FormControl('');

    for (const validator of buildPasswordValidators()) {
      control.addValidators(validator);
    }

    control.updateValueAndValidity();

    expect(control.hasError('required')).toBe(true);

    control.setValue('x'.repeat(PASSWORD_MIN_LENGTH - 1));
    control.updateValueAndValidity();

    expect(control.hasError('minlength')).toBe(true);
  });

  it('marks the confirmation control when passwords differ', () => {
    const form = new FormGroup({
      password: new FormControl('secret123'),
      confirmPassword: new FormControl('secret456'),
    });

    expect(passwordsMatchValidator(form)).toEqual({ passwordMismatch: true });
    expect(form.controls.confirmPassword.hasError('passwordMismatch')).toBe(true);

    form.controls.confirmPassword.setValue('secret123');

    expect(passwordsMatchValidator(form)).toBeNull();
    expect(form.controls.confirmPassword.hasError('passwordMismatch')).toBe(false);
  });
});