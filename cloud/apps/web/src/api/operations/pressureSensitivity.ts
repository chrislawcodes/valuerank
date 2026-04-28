import type {
  PressureSensitivityQuery as GeneratedPressureSensitivityQuery,
  PressureSensitivityQueryVariables as GeneratedPressureSensitivityQueryVariables,
} from '../../generated/graphql';

// ============================================================================
// QUERY DOCUMENT
// ============================================================================

export { PressureSensitivityDocument as PRESSURE_SENSITIVITY_QUERY } from '../../generated/graphql';

// ============================================================================
// TYPES — all derived from the codegen-generated query shape
// ============================================================================

export type PressureSensitivityQueryResult = GeneratedPressureSensitivityQuery;
export type PressureSensitivityQueryVariables = GeneratedPressureSensitivityQueryVariables;

export type PressureSensitivityResult = GeneratedPressureSensitivityQuery['pressureSensitivity'];
export type PressureSensitivityModel = PressureSensitivityResult['models'][number];
export type PressureSensitivityInsufficient = PressureSensitivityResult['insufficient'][number];
export type PressureSensitivityExcludedDefinition =
  PressureSensitivityResult['excludedDefinitions'][number];

export type PressureSensitivityValuePair = PressureSensitivityModel['valuePairs'][number];
export type PressureSensitivityCell = PressureSensitivityValuePair['grid'][number];
export type PressureSensitivityBandStat = PressureSensitivityValuePair['directionDelta'];
export type PressureSensitivityBaseline = PressureSensitivityValuePair['baselineWinRate'];
export type PressureSensitivityAggregate = PressureSensitivityModel['aggregateSensitivity'];

export type DirectionalSanityCheck = PressureSensitivityResult['directionalSanityCheck'];
export type DirectionalSanityCheckEntry = DirectionalSanityCheck['breakdown'][number];
