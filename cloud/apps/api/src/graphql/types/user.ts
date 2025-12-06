/**
 * GraphQL types for user information
 *
 * Defines the User type for the `me` query
 */

import { builder } from '../builder.js';

// User type representing the current authenticated user
export const UserRef = builder.objectRef<{
  id: string;
  email: string;
  name: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}>('User');

builder.objectType(UserRef, {
  description: 'A user account',
  fields: (t) => ({
    id: t.exposeID('id', { description: 'Unique user identifier' }),
    email: t.exposeString('email', { description: 'User email address' }),
    name: t.expose('name', {
      type: 'String',
      nullable: true,
      description: 'User display name',
    }),
    lastLoginAt: t.expose('lastLoginAt', {
      type: 'DateTime',
      nullable: true,
      description: 'When the user last logged in',
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
      description: 'When the account was created',
    }),
  }),
});
