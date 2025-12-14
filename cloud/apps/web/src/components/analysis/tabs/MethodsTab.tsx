/**
 * Methods Tab
 *
 * Displays documentation of statistical methods used in analysis.
 */

import { MethodsDocumentation } from '../MethodsDocumentation';
import type { AnalysisWarning, MethodsUsed } from './types';

type MethodsTabProps = {
  methodsUsed: MethodsUsed;
  warnings: AnalysisWarning[];
};

export function MethodsTab({ methodsUsed, warnings }: MethodsTabProps) {
  return <MethodsDocumentation methodsUsed={methodsUsed} warnings={warnings} />;
}
