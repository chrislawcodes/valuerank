// Get current authenticated user
// Used by AuthContext to validate token and get user info
export { MeDocument as ME_QUERY } from '../../generated/graphql';

export type MeQueryResult = {
  me: {
    id: string;
    email: string;
    name: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  } | null;
};
