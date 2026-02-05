import { describe, expect, it } from 'vitest';
import { ValidationError } from '@valuerank/shared';
import { requireTty } from './ensure-user.js';

describe('ensure-user', () => {
  it('throws when not running in a TTY', () => {
    expect(() => requireTty(false)).toThrow(ValidationError);
  });

  it('does not throw when running in a TTY', () => {
    expect(() => requireTty(true)).not.toThrow();
  });
});
