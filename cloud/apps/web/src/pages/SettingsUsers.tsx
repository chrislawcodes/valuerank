import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from 'urql';
import { AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import {
  CREATE_USER_MUTATION,
  LIST_USERS_QUERY,
  UPDATE_USER_ROLE_MUTATION,
  type CreateUserMutation,
  type CreateUserMutationVariables,
  type ListUsersQuery,
  type UpdateUserRoleMutation,
  type UpdateUserRoleMutationVariables,
  type UserRole,
} from '../api/operations/user';

type FormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
};

function getGraphQLErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'graphQLErrors' in error) {
    const graphQLErrors = (error as { graphQLErrors?: Array<{ message?: string }> }).graphQLErrors;
    if (graphQLErrors && graphQLErrors.length > 0 && graphQLErrors[0]?.message) {
      return graphQLErrors[0].message;
    }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }

  return fallback;
}

function formatDate(value: string | null | undefined): string {
  if (value == null || value === '') return 'Never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
}

export function SettingsUsers() {
  const [{ data, fetching, error }, reexecuteQuery] = useQuery<ListUsersQuery>({
    query: LIST_USERS_QUERY,
    requestPolicy: 'network-only',
  });
  const [, createUser] = useMutation<CreateUserMutation, CreateUserMutationVariables>(CREATE_USER_MUTATION);
  const [, updateUserRole] = useMutation<UpdateUserRoleMutation, UpdateUserRoleMutationVariables>(UPDATE_USER_ROLE_MUTATION);

  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    password: '',
    role: 'VISITOR',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const users = data?.listUsers ?? [];

  const refreshUsers = async () => {
    await reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError(null);
    setBanner(null);
    setIsCreating(true);

    try {
      const result = await createUser({
        input: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        },
      });

      if (result.error) {
        throw result.error;
      }

      setForm({
        name: '',
        email: '',
        password: '',
        role: 'VISITOR',
      });
      setBanner('User created successfully.');
      await refreshUsers();
    } catch (err) {
      setActionError(getGraphQLErrorMessage(err, 'Failed to create user'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setActionError(null);
    setBanner(null);
    setUpdatingUserId(userId);

    try {
      const result = await updateUserRole({
        input: {
          userId,
          role,
        },
      });

      if (result.error) {
        throw result.error;
      }

      setBanner('Role changes take effect on the user\'s next login.');
      await refreshUsers();
    } catch (err) {
      setActionError(getGraphQLErrorMessage(err, 'Failed to update role'));
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">User Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create accounts and assign roles. Visitors can only read data and change their own password.
        </p>
      </div>

      {banner && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-start gap-2">
          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{banner}</span>
        </div>
      )}

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-[#1A1A1A]">Create User</h2>
          <p className="text-sm text-gray-500">Admins create accounts directly and set the initial password.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
            <Input
              label="Name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
              minLength={12}
            />
            <label className="space-y-2">
              <span className="block text-sm font-medium text-gray-700">Role</span>
              <select
                value={form.role}
                onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                className="h-11 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              >
                <option value="ADMIN">Admin</option>
                <option value="VISITOR">Visitor</option>
              </select>
            </label>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={isCreating || form.name.trim() === '' || form.email.trim() === '' || form.password.length < 12}>
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create User'
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-[#1A1A1A]">All Users</h2>
          <p className="text-sm text-gray-500">Role changes take effect on the user&apos;s next login.</p>
        </CardHeader>
        <CardContent>
          {fetching && !data ? (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading users...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error.message}
            </div>
          ) : users.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
              No users exist yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-3 pr-4">Name</th>
                    <th className="py-3 pr-4">Email</th>
                    <th className="py-3 pr-4">Role</th>
                    <th className="py-3 pr-4">Last Login</th>
                    <th className="py-3 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <tr key={user.id} className="align-top">
                      <td className="py-3 pr-4 font-medium text-gray-900">{user.name ?? 'Unnamed user'}</td>
                      <td className="py-3 pr-4 text-gray-700">{user.email}</td>
                      <td className="py-3 pr-4">
                        <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.email}</label>
                        <select
                          id={`role-${user.id}`}
                          value={user.role}
                          onChange={(event) => void handleRoleChange(user.id, event.target.value as UserRole)}
                          disabled={updatingUserId === user.id}
                          className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-wait disabled:bg-gray-100"
                        >
                          <option value="ADMIN">Admin</option>
                          <option value="VISITOR">Visitor</option>
                        </select>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">{formatDate(user.lastLoginAt)}</td>
                      <td className="py-3 pr-4 text-gray-700">{formatDate(user.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
