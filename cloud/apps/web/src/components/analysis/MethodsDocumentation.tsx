/**
 * MethodsDocumentation Component
 *
 * Displays statistical methods used in the analysis with expandable details
 * and warning indicators for data quality issues.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import type { MethodsUsed, AnalysisWarning } from '../../api/operations/analysis';

type MethodsDocumentationProps = {
  methodsUsed: MethodsUsed;
  warnings: AnalysisWarning[];
  defaultExpanded?: boolean;
};

type MethodInfo = {
  label: string;
  value: string;
  description: string;
};

/**
 * Get warning severity based on code.
 */
function getWarningSeverity(code: string): 'high' | 'medium' | 'low' {
  if (code.includes('SMALL_SAMPLE') || code.includes('INVALID')) return 'high';
  if (code.includes('NON_NORMAL') || code.includes('SKEWED')) return 'medium';
  return 'low';
}

/**
 * Get icon and color for warning severity.
 */
function getWarningStyle(severity: 'high' | 'medium' | 'low') {
  switch (severity) {
    case 'high':
      return { icon: AlertTriangle, bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-700', iconColor: 'text-red-500' };
    case 'medium':
      return { icon: AlertTriangle, bgColor: 'bg-amber-50', borderColor: 'border-amber-200', textColor: 'text-amber-700', iconColor: 'text-amber-500' };
    case 'low':
      return { icon: Info, bgColor: 'bg-blue-50', borderColor: 'border-blue-200', textColor: 'text-blue-700', iconColor: 'text-blue-500' };
  }
}

/**
 * Method descriptions for tooltips.
 */
const METHOD_DESCRIPTIONS: Record<string, string> = {
  // Win Rate CI
  'wilson': 'Wilson score interval - recommended for proportions, especially with small samples',
  'wilson_score': 'Wilson score interval - recommended for proportions, especially with small samples',
  'clopper_pearson': 'Clopper-Pearson exact interval - conservative but exact coverage',

  // Model Comparison
  'spearman': "Spearman's rank correlation - non-parametric measure of rank correlation",
  'spearman_rho': "Spearman's rank correlation - non-parametric measure of rank correlation",
  'pearson': "Pearson correlation - linear correlation coefficient",

  // P-Value Correction
  'bonferroni': 'Bonferroni correction - conservative multiple testing correction',
  'holm': 'Holm-Bonferroni method - step-down procedure, less conservative than Bonferroni',
  'fdr': 'False Discovery Rate - controls expected proportion of false positives',
  'none': 'No correction applied - use with caution for multiple comparisons',

  // Effect Size
  'cohens_d': "Cohen's d - standardized mean difference",
  'hedges_g': "Hedges' g - bias-corrected standardized mean difference",

  // Dimension Test
  'factorial_anova': 'Factorial ANOVA - tests effects of multiple factors and interactions',
  'one_way_anova': 'One-way ANOVA - tests effect of a single factor',
  'kruskal_wallis': 'Kruskal-Wallis H test - non-parametric alternative to ANOVA',
};

/**
 * Get description for a method value.
 */
function getMethodDescription(value: string): string {
  const key = value.toLowerCase().replace(/[^a-z_]/g, '_');
  return METHOD_DESCRIPTIONS[key] || `Statistical method: ${value}`;
}

/**
 * Format method value for display.
 */
function formatMethodValue(value: string | number): string {
  if (typeof value === 'number') return value.toString();
  return value.replace(/_/g, ' ');
}

export function MethodsDocumentation({
  methodsUsed,
  warnings,
  defaultExpanded = false,
}: MethodsDocumentationProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const methods: MethodInfo[] = [
    {
      label: 'Win Rate Confidence Interval',
      value: methodsUsed.winRateCI,
      description: getMethodDescription(methodsUsed.winRateCI),
    },
    {
      label: 'Model Comparison',
      value: methodsUsed.modelComparison,
      description: getMethodDescription(methodsUsed.modelComparison),
    },
    {
      label: 'P-Value Correction',
      value: methodsUsed.pValueCorrection,
      description: getMethodDescription(methodsUsed.pValueCorrection),
    },
    {
      label: 'Effect Size Measure',
      value: methodsUsed.effectSize,
      description: getMethodDescription(methodsUsed.effectSize),
    },
    {
      label: 'Dimension Analysis',
      value: methodsUsed.dimensionTest,
      description: getMethodDescription(methodsUsed.dimensionTest),
    },
    {
      label: 'Significance Level (α)',
      value: String(methodsUsed.alpha),
      description: `Type I error rate threshold: ${methodsUsed.alpha}`,
    },
  ];

  const hasWarnings = warnings.length > 0;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      {/* eslint-disable-next-line react/forbid-elements -- Accordion toggle requires custom semantic button styling */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            Statistical Methods Used
          </span>
          {hasWarnings ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <AlertTriangle className="w-3 h-3 mr-1" />
              {warnings.length} warning{warnings.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <CheckCircle className="w-3 h-3 mr-1" />
              All checks passed
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Warnings section */}
          {hasWarnings && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Data Quality Warnings
              </h4>
              {warnings.map((warning, index) => {
                const severity = getWarningSeverity(warning.code);
                const style = getWarningStyle(severity);
                const Icon = style.icon;

                return (
                  <div
                    key={`${warning.code}-${index}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${style.bgColor} ${style.borderColor}`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${style.iconColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${style.textColor}`}>
                        {warning.message}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {warning.recommendation}
                      </p>
                      <span className="inline-block mt-1 text-xs text-gray-400 font-mono">
                        {warning.code}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Methods grid */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
              Methods & Parameters
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {methods.map((method) => (
                <div
                  key={method.label}
                  className="p-3 bg-gray-50 rounded-lg"
                  title={method.description}
                >
                  <div className="text-xs text-gray-500">{method.label}</div>
                  <div className="text-sm font-medium text-gray-900 mt-0.5">
                    {formatMethodValue(method.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Version info */}
          <div className="pt-3 border-t border-gray-200 text-xs text-gray-400">
            Analysis code version: {methodsUsed.codeVersion}
          </div>
        </div>
      )}
    </div>
  );
}
