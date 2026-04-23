import gql from 'graphql-tag';

import type { User } from '../../types';

export type UserRole = 'ADMIN' | 'VISITOR';

export type ListUsersQueryResult = {
  listUsers: User[];
};

export const LIST_USERS_QUERY = gql`
  query ListUsers {
    listUsers {
      id
      email
      name
      role
      mustChangePassword
      lastLoginAt
      createdAt
    }
  }
`;

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  role: UserRole;
};

export type CreateUserMutationVariables = {
  input: CreateUserInput;
};

export type CreateUserMutationResult = {
  createUser: User;
};

export const CREATE_USER_MUTATION = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      email
      name
      role
      mustChangePassword
      lastLoginAt
      createdAt
    }
  }
`;

export type UpdateUserRoleMutationVariables = {
  input: {
    userId: string;
    role: UserRole;
  };
};

export type UpdateUserRoleMutationResult = {
  updateUserRole: User;
};

export const UPDATE_USER_ROLE_MUTATION = gql`
  mutation UpdateUserRole($input: UpdateUserRoleInput!) {
    updateUserRole(input: $input) {
      id
      email
      name
      role
      mustChangePassword
      lastLoginAt
      createdAt
    }
  }
`;
