import type {
  CircumplexAnalysisQuery as GeneratedCircumplexAnalysisQuery,
  CircumplexAnalysisQueryVariables as GeneratedCircumplexAnalysisQueryVariables,
} from '../../generated/graphql';

export { CircumplexAnalysisDocument as CIRCUMPLEX_ANALYSIS_QUERY } from '../../generated/graphql';

export type CircumplexAnalysisQueryResult = GeneratedCircumplexAnalysisQuery;
export type CircumplexAnalysisQueryVariables = GeneratedCircumplexAnalysisQueryVariables;

export type CircumplexAnalysisResult = GeneratedCircumplexAnalysisQuery['circumplexAnalysis'];
export type CircumplexResult = CircumplexAnalysisResult['models'][number];
export type CircumplexInsufficientModel = CircumplexAnalysisResult['insufficient'][number];
export type CircumplexPerValue = CircumplexResult['trialsPerValue'][number];
export type CircumplexMdsCoord = CircumplexResult['mds2d'][number];
