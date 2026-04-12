import type {
  ValueStatementsQuery as GeneratedValueStatementsQuery,
  CreateValueStatementMutation as GeneratedCreateValueStatementMutation,
  UpdateValueStatementMutation as GeneratedUpdateValueStatementMutation,
  DeleteValueStatementMutation as GeneratedDeleteValueStatementMutation,
  ValueStatementsQueryVariables as GeneratedValueStatementsQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// TYPES
// ============================================================================

export type ValueStatement = GeneratedValueStatementsQuery['valueStatements'][number];

// ============================================================================
// QUERIES
// ============================================================================

export { ValueStatementsDocument as VALUE_STATEMENTS_QUERY } from '../../generated/graphql';

// ============================================================================
// MUTATIONS
// ============================================================================

export { CreateValueStatementDocument as CREATE_VALUE_STATEMENT_MUTATION } from '../../generated/graphql';
export { UpdateValueStatementDocument as UPDATE_VALUE_STATEMENT_MUTATION } from '../../generated/graphql';
export { DeleteValueStatementDocument as DELETE_VALUE_STATEMENT_MUTATION } from '../../generated/graphql';

// ============================================================================
// RESULT TYPES
// ============================================================================

export type ValueStatementsQueryVariables = GeneratedValueStatementsQueryVariables;
export type ValueStatementsQueryResult = GeneratedValueStatementsQuery;
export type CreateValueStatementResult = GeneratedCreateValueStatementMutation;
export type UpdateValueStatementResult = GeneratedUpdateValueStatementMutation;
export type DeleteValueStatementResult = GeneratedDeleteValueStatementMutation;
