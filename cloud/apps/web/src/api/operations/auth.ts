import { gql } from 'urql';

// Get current authenticated user
// Used by AuthContext to validate token and get user info
export const ME_QUERY = gql`
  query Me {
    me {
      id
      email
      name
      lastLoginAt
      createdAt
    }
  }
`;

export type MeQueryResult = {
  me: {
    id: string;
    email: string;
    name: string | null;
    lastLoginAt: string | null;
    createdAt: string;
  } | null;
};
