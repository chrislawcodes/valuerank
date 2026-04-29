import { db, Prisma } from '@valuerank/db';
import { NotFoundError, ValidationError } from '@valuerank/shared';
import { GraphQLError } from 'graphql';

import { builder } from '../builder.js';
import { UserRef } from '../types/user.js';
import { UserRoleEnum } from '../types/enums.js';
import { hashPassword } from '../../auth/services.js';

const MIN_PASSWORD_LENGTH = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function throwAdminAccessError(): never {
  throw new GraphQLError('Admin access required', {
    extensions: {
      code: 'FORBIDDEN',
      http: {
        status: 403,
      },
    },
  });
}

const CreateUserInput = builder.inputType('CreateUserInput', {
  fields: (t) => ({
    email: t.string({
      required: true,
      validate: {
        minLength: [1, { message: 'Email is required' }],
      },
    }),
    name: t.string({
      required: true,
      validate: {
        minLength: [1, { message: 'Name is required' }],
      },
    }),
    password: t.string({
      required: true,
      validate: {
        minLength: [MIN_PASSWORD_LENGTH, { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }],
      },
    }),
    role: t.field({
      type: UserRoleEnum,
      required: true,
    }),
  }),
});

const UpdateUserRoleInput = builder.inputType('UpdateUserRoleInput', {
  fields: (t) => ({
    userId: t.id({
      required: true,
      validate: {
        minLength: [1, { message: 'User ID is required' }],
      },
    }),
    role: t.field({
      type: UserRoleEnum,
      required: true,
    }),
  }),
});

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateEmail(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

function toUserSummary(user: {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'VISITOR';
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return user;
}

builder.mutationField('createUser', (t) =>
  t.field({
    type: UserRef,
    description: 'Create a new user account. Admin only.',
    args: {
      input: t.arg({ type: CreateUserInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user === null || ctx.user === undefined || ctx.user.role !== 'ADMIN') {
        throwAdminAccessError();
      }

      const email = normalizeEmail(args.input.email);
      const name = args.input.name.trim();
      const password = args.input.password;
      const role = args.input.role;

      validateEmail(email);

      if (name.length === 0) {
        throw new ValidationError('Name is required');
      }

      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }

      const passwordHash = await hashPassword(password);

      try {
        const user = await db.user.create({
          data: {
            email,
            name,
            passwordHash,
            role,
            mustChangePassword: true,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            mustChangePassword: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });

        return toUserSummary(user);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ValidationError(`User with email "${email}" already exists`);
        }
        throw error;
      }
    },
  })
);

builder.mutationField('updateUserRole', (t) =>
  t.field({
    type: UserRef,
    description: 'Update a user role. Admin only.',
    args: {
      input: t.arg({ type: UpdateUserRoleInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      if (ctx.user === null || ctx.user === undefined || ctx.user.role !== 'ADMIN') {
        throwAdminAccessError();
      }

      const userId = String(args.input.userId);
      const nextRole = args.input.role;

      const updatedUser = await db.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            role: true,
          },
        });

        if (!existing) {
          throw new NotFoundError('User', userId);
        }

        if (existing.role === nextRole) {
          return tx.user.findUniqueOrThrow({
            where: { id: userId },
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              mustChangePassword: true,
              lastLoginAt: true,
              createdAt: true,
            },
          });
        }

        if (existing.role === 'ADMIN' && nextRole === 'VISITOR') {
          const adminCount = await tx.user.count({
            where: { role: 'ADMIN' },
          });

          if (adminCount <= 1) {
            throw new ValidationError('At least one admin must remain');
          }
        }

        return tx.user.update({
          where: { id: userId },
          data: {
            role: nextRole,
          },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            mustChangePassword: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });

      return toUserSummary(updatedUser);
    },
  })
);
