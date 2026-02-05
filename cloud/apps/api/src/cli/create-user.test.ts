import { describe, expect, it } from 'vitest';
import { ValidationError } from '@valuerank/shared';
import { validateEmail, validatePassword } from './create-user.js';

describe('create-user validations', () => {
  it('accepts valid emails', () => {
    expect(() => validateEmail('user@example.com')).not.toThrow();
  });

  it('rejects invalid emails', () => {
    expect(() => validateEmail('not-an-email')).toThrow(ValidationError);
  });

  it('accepts valid passwords', () => {
    expect(() => validatePassword('long-enough')).not.toThrow();
  });

  it('rejects short passwords', () => {
    expect(() => validatePassword('short')).toThrow(ValidationError);
  });
});
