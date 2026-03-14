import { gql } from 'urql';

export type ValueStatement = {
  id: string;
  token: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export const VALUE_STATEMENTS_QUERY = gql`
  query ValueStatements {
    valueStatements {
      id
      token
      body
      updatedAt
    }
  }
`;

export const CREATE_VALUE_STATEMENT_MUTATION = gql`
  mutation CreateValueStatement($input: CreateValueStatementInput!) {
    createValueStatement(input: $input) {
      id
      token
      body
      updatedAt
    }
  }
`;

export const UPDATE_VALUE_STATEMENT_MUTATION = gql`
  mutation UpdateValueStatement($id: ID!, $input: UpdateValueStatementInput!) {
    updateValueStatement(id: $id, input: $input) {
      id
      token
      body
      updatedAt
    }
  }
`;

export const DELETE_VALUE_STATEMENT_MUTATION = gql`
  mutation DeleteValueStatement($id: ID!) {
    deleteValueStatement(id: $id)
  }
`;

export type ValueStatementsQueryResult = { valueStatements: ValueStatement[] };
export type CreateValueStatementResult = { createValueStatement: ValueStatement };
export type UpdateValueStatementResult = { updateValueStatement: ValueStatement };
