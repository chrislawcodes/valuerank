import { builder } from '../builder.js';
import { ValidationError } from '@valuerank/shared';

// DateTime scalar - serializes to ISO 8601 string
builder.scalarType('DateTime', {
  serialize: (value) => value.toISOString(),
  parseValue: (value) => {
    if (typeof value !== 'string') {
      throw new ValidationError('DateTime must be a string');
    }
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid DateTime format');
    }
    return date;
  },
});

// JSON scalar - pass-through for JSONB fields
builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
});
