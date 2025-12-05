#!/usr/bin/env python3
"""
Deep Analysis Script for ValueRank Multi-Dimensional Model Comparison

This script performs statistical analysis on model decision data to identify:
1. Dimension sensitivity (which dimensions drive model divergence)
2. Model outliers (which models behave anomalously)
3. Inter-model agreement patterns

Usage:
    python deep_analysis.py input.csv [--output output.json]

Or via stdin:
    cat input.csv | python deep_analysis.py --stdin
"""

import sys
import json
import argparse
import warnings
from io import StringIO
from typing import Dict, List, Any, Tuple
import csv

import numpy as np
import pandas as pd
from scipy import stats
from scipy.spatial.distance import mahalanobis
from sklearn.ensemble import IsolationForest
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

# Suppress warnings for cleaner output
warnings.filterwarnings('ignore')


class NumpyJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder that handles numpy types."""
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.bool_):
            return bool(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)


def parse_csv(content: str) -> pd.DataFrame:
    """Parse CSV content into a pandas DataFrame."""
    return pd.read_csv(StringIO(content))


def identify_columns(df: pd.DataFrame) -> Tuple[str, str, str, List[str]]:
    """Identify the key columns in the data.

    Returns: (model_col, decision_col, scenario_col, dimension_cols)
    """
    # Known column names
    model_col = 'AI Model Name'
    decision_col = 'Decision Code'
    scenario_col = 'Scenario'

    # Dimension columns are everything except known columns
    known_cols = {model_col, decision_col, scenario_col, 'Decision Text'}
    dimension_cols = [c for c in df.columns if c not in known_cols]

    return model_col, decision_col, scenario_col, dimension_cols


def compute_basic_stats(df: pd.DataFrame, model_col: str, decision_col: str) -> Dict[str, Any]:
    """Compute basic descriptive statistics per model."""
    stats_per_model = {}

    for model in df[model_col].unique():
        model_data = df[df[model_col] == model][decision_col].astype(float)
        stats_per_model[model] = {
            'mean': float(model_data.mean()),
            'std': float(model_data.std()),
            'min': float(model_data.min()),
            'max': float(model_data.max()),
            'median': float(model_data.median()),
            'count': int(len(model_data))
        }

    return stats_per_model


def compute_dimension_variance(df: pd.DataFrame, model_col: str, decision_col: str,
                               dimension_cols: List[str]) -> Dict[str, Any]:
    """Compute variance analysis per dimension.

    For each dimension value, compute how much models diverge.
    """
    results = {}

    for dim in dimension_cols:
        dim_analysis = {
            'values': {},
            'overall_variance': 0.0,
            'drives_divergence': False
        }

        try:
            # Get unique dimension values
            dim_values = sorted(df[dim].dropna().unique())
            all_variances = []

            for val in dim_values:
                subset = df[df[dim] == val]
                if len(subset) < 2:
                    continue

                # Get average decision per model at this dimension value
                model_decisions = []
                for model in df[model_col].unique():
                    model_subset = subset[subset[model_col] == model]
                    if len(model_subset) > 0:
                        avg_decision = model_subset[decision_col].astype(float).mean()
                        model_decisions.append(avg_decision)

                if len(model_decisions) > 1:
                    variance = float(np.var(model_decisions))
                    dim_analysis['values'][str(val)] = {
                        'model_variance': variance,
                        'model_count': len(model_decisions)
                    }
                    all_variances.append(variance)

            if all_variances:
                dim_analysis['overall_variance'] = float(np.mean(all_variances))
                # A dimension drives divergence if its variance is above median
                dim_analysis['drives_divergence'] = dim_analysis['overall_variance'] > 0.5

        except Exception as e:
            dim_analysis['error'] = str(e)

        results[dim] = dim_analysis

    # Rank dimensions by variance
    ranked = sorted(results.items(), key=lambda x: x[1].get('overall_variance', 0), reverse=True)

    return {
        'per_dimension': results,
        'ranked_by_variance': [{'dimension': d, 'variance': v['overall_variance']}
                               for d, v in ranked if 'overall_variance' in v]
    }


def compute_model_correlations(df: pd.DataFrame, model_col: str, decision_col: str,
                                dimension_cols: List[str]) -> Dict[str, Any]:
    """Compute Pearson correlation between each dimension and model decisions."""
    correlations = {}

    models = df[model_col].unique().tolist()

    for dim in dimension_cols:
        correlations[dim] = {}

        for model in models:
            model_data = df[df[model_col] == model].copy()

            try:
                dim_vals = pd.to_numeric(model_data[dim], errors='coerce')
                decisions = pd.to_numeric(model_data[decision_col], errors='coerce')

                # Remove NaN pairs
                valid_mask = ~(dim_vals.isna() | decisions.isna())
                dim_vals = dim_vals[valid_mask]
                decisions = decisions[valid_mask]

                if len(dim_vals) >= 3:
                    corr, pval = stats.pearsonr(dim_vals, decisions)
                    correlations[dim][model] = {
                        'correlation': float(corr) if not np.isnan(corr) else 0.0,
                        'p_value': float(pval) if not np.isnan(pval) else 1.0,
                        'significant': pval < 0.05 if not np.isnan(pval) else False
                    }
                else:
                    correlations[dim][model] = {
                        'correlation': 0.0,
                        'p_value': 1.0,
                        'significant': False,
                        'note': 'insufficient_data'
                    }
            except Exception as e:
                correlations[dim][model] = {
                    'correlation': 0.0,
                    'p_value': 1.0,
                    'significant': False,
                    'error': str(e)
                }

    # Find strongest correlations
    strongest = []
    for dim, model_corrs in correlations.items():
        for model, corr_data in model_corrs.items():
            strongest.append({
                'dimension': dim,
                'model': model,
                'correlation': corr_data['correlation'],
                'significant': corr_data.get('significant', False)
            })

    strongest.sort(key=lambda x: abs(x['correlation']), reverse=True)

    # Find most divisive dimensions (highest variance in correlations across models)
    divisive = []
    for dim, model_corrs in correlations.items():
        corrs = [c['correlation'] for c in model_corrs.values() if 'correlation' in c]
        if len(corrs) > 1:
            divisive.append({
                'dimension': dim,
                'correlation_spread': float(np.std(corrs)),
                'mean_correlation': float(np.mean(corrs))
            })

    divisive.sort(key=lambda x: x['correlation_spread'], reverse=True)

    return {
        'matrix': correlations,
        'strongest_correlations': strongest[:10],
        'most_divisive_dimensions': divisive
    }


def compute_inter_model_agreement(df: pd.DataFrame, model_col: str, decision_col: str,
                                   scenario_col: str) -> Dict[str, Any]:
    """Compute inter-model agreement metrics."""
    models = df[model_col].unique().tolist()
    scenarios = df[scenario_col].unique().tolist()

    # Build scenario x model matrix
    matrix = {}
    for scenario in scenarios:
        matrix[scenario] = {}
        scenario_data = df[df[scenario_col] == scenario]
        for model in models:
            model_data = scenario_data[scenario_data[model_col] == model]
            if len(model_data) > 0:
                matrix[scenario][model] = float(model_data[decision_col].astype(float).mean())
            else:
                matrix[scenario][model] = None

    # Compute pairwise model agreement (correlation)
    pairwise_agreement = {}
    for i, model1 in enumerate(models):
        for model2 in models[i+1:]:
            model1_decisions = []
            model2_decisions = []

            for scenario in scenarios:
                if matrix[scenario].get(model1) is not None and matrix[scenario].get(model2) is not None:
                    model1_decisions.append(matrix[scenario][model1])
                    model2_decisions.append(matrix[scenario][model2])

            if len(model1_decisions) >= 3:
                corr, _ = stats.pearsonr(model1_decisions, model2_decisions)
                agreement = float(corr) if not np.isnan(corr) else 0.0
            else:
                agreement = 0.0

            pairwise_agreement[f"{model1} <-> {model2}"] = agreement

    # Overall agreement (average pairwise)
    avg_agreement = np.mean(list(pairwise_agreement.values())) if pairwise_agreement else 0.0

    # Compute per-scenario variance (disagreement)
    scenario_disagreement = {}
    for scenario in scenarios:
        decisions = [v for v in matrix[scenario].values() if v is not None]
        if len(decisions) > 1:
            scenario_disagreement[scenario] = {
                'variance': float(np.var(decisions)),
                'range': float(max(decisions) - min(decisions)),
                'decisions': {m: v for m, v in matrix[scenario].items() if v is not None}
            }

    # Find most contested scenarios
    contested = sorted(scenario_disagreement.items(),
                       key=lambda x: x[1]['variance'], reverse=True)

    return {
        'pairwise_agreement': pairwise_agreement,
        'average_agreement': float(avg_agreement),
        'per_scenario_disagreement': scenario_disagreement,
        'most_contested_scenarios': [
            {'scenario': s, **data} for s, data in contested[:10]
        ]
    }


def detect_outlier_models(df: pd.DataFrame, model_col: str, decision_col: str,
                          scenario_col: str) -> Dict[str, Any]:
    """Detect models that behave anomalously compared to the group."""
    models = df[model_col].unique().tolist()
    scenarios = df[scenario_col].unique().tolist()

    # Build model response matrix (models x scenarios)
    response_matrix = []
    model_order = []

    for model in models:
        model_responses = []
        for scenario in scenarios:
            subset = df[(df[model_col] == model) & (df[scenario_col] == scenario)]
            if len(subset) > 0:
                model_responses.append(float(subset[decision_col].astype(float).mean()))
            else:
                model_responses.append(np.nan)

        # Only include models with enough data
        if sum(~np.isnan(model_responses)) > len(scenarios) * 0.5:
            # Fill NaN with mean for that model
            mean_val = np.nanmean(model_responses)
            model_responses = [mean_val if np.isnan(x) else x for x in model_responses]
            response_matrix.append(model_responses)
            model_order.append(model)

    if len(response_matrix) < 3:
        return {
            'error': 'Insufficient models for outlier detection',
            'models_analyzed': len(response_matrix)
        }

    response_matrix = np.array(response_matrix)

    # Method 1: Mahalanobis Distance
    mahalanobis_scores = {}
    try:
        mean = np.mean(response_matrix, axis=0)
        cov = np.cov(response_matrix.T)

        # Regularize covariance matrix to avoid singularity
        cov += np.eye(cov.shape[0]) * 1e-6
        cov_inv = np.linalg.inv(cov)

        for i, model in enumerate(model_order):
            dist = mahalanobis(response_matrix[i], mean, cov_inv)
            mahalanobis_scores[model] = float(dist)
    except Exception as e:
        mahalanobis_scores = {'error': str(e)}

    # Method 2: Isolation Forest
    isolation_scores = {}
    try:
        clf = IsolationForest(contamination=0.2, random_state=42, n_estimators=100)
        predictions = clf.fit_predict(response_matrix)
        scores = clf.score_samples(response_matrix)

        for i, model in enumerate(model_order):
            isolation_scores[model] = {
                'is_outlier': bool(predictions[i] == -1),
                'anomaly_score': float(-scores[i])  # Higher = more anomalous
            }
    except Exception as e:
        isolation_scores = {'error': str(e)}

    # Method 3: Leave-One-Out Analysis (Jackknife)
    jackknife_influence = {}
    try:
        # Compute overall variance with all models
        full_variance = np.var(response_matrix)

        for i, model in enumerate(model_order):
            # Variance without this model
            mask = np.ones(len(model_order), dtype=bool)
            mask[i] = False
            subset_variance = np.var(response_matrix[mask])

            # Influence = how much this model affects total variance
            influence = full_variance - subset_variance
            jackknife_influence[model] = {
                'influence_on_variance': float(influence),
                'increases_variance': influence > 0
            }
    except Exception as e:
        jackknife_influence = {'error': str(e)}

    # Combine scores to identify outliers
    outlier_summary = []
    for model in model_order:
        summary = {'model': model, 'outlier_indicators': 0}

        if isinstance(mahalanobis_scores, dict) and model in mahalanobis_scores:
            summary['mahalanobis_distance'] = mahalanobis_scores[model]
            # High Mahalanobis = outlier
            if mahalanobis_scores[model] > np.median(list(mahalanobis_scores.values())) * 1.5:
                summary['outlier_indicators'] += 1

        if isinstance(isolation_scores, dict) and model in isolation_scores:
            summary['isolation_forest'] = isolation_scores[model]
            if isolation_scores[model].get('is_outlier', False):
                summary['outlier_indicators'] += 1

        if isinstance(jackknife_influence, dict) and model in jackknife_influence:
            summary['jackknife'] = jackknife_influence[model]
            if jackknife_influence[model].get('increases_variance', False):
                summary['outlier_indicators'] += 1

        outlier_summary.append(summary)

    # Sort by outlier indicators
    outlier_summary.sort(key=lambda x: x['outlier_indicators'], reverse=True)

    return {
        'mahalanobis_distances': mahalanobis_scores,
        'isolation_forest': isolation_scores,
        'jackknife_influence': jackknife_influence,
        'outlier_ranking': outlier_summary
    }


def compute_pca_analysis(df: pd.DataFrame, model_col: str, decision_col: str,
                         scenario_col: str) -> Dict[str, Any]:
    """Perform PCA to visualize model positioning."""
    models = df[model_col].unique().tolist()
    scenarios = df[scenario_col].unique().tolist()

    # Build model response matrix
    response_matrix = []
    model_order = []

    for model in models:
        model_responses = []
        for scenario in scenarios:
            subset = df[(df[model_col] == model) & (df[scenario_col] == scenario)]
            if len(subset) > 0:
                model_responses.append(float(subset[decision_col].astype(float).mean()))
            else:
                model_responses.append(np.nan)

        if sum(~np.isnan(model_responses)) > len(scenarios) * 0.5:
            mean_val = np.nanmean(model_responses)
            model_responses = [mean_val if np.isnan(x) else x for x in model_responses]
            response_matrix.append(model_responses)
            model_order.append(model)

    if len(response_matrix) < 2:
        return {'error': 'Insufficient models for PCA'}

    response_matrix = np.array(response_matrix)

    try:
        # Standardize
        scaler = StandardScaler()
        scaled_matrix = scaler.fit_transform(response_matrix)

        # PCA
        n_components = min(2, len(model_order) - 1, len(scenarios))
        pca = PCA(n_components=n_components)
        coords = pca.fit_transform(scaled_matrix)

        # Model coordinates
        model_coords = {}
        for i, model in enumerate(model_order):
            model_coords[model] = {
                'x': float(coords[i, 0]),
                'y': float(coords[i, 1]) if n_components > 1 else 0.0
            }

        # Explained variance
        explained_variance = [float(v) for v in pca.explained_variance_ratio_]

        # Loadings (which scenarios contribute most to each PC)
        loadings = {}
        for i, scenario in enumerate(scenarios):
            loadings[scenario] = {
                'pc1_loading': float(pca.components_[0, i]),
                'pc2_loading': float(pca.components_[1, i]) if n_components > 1 else 0.0
            }

        return {
            'model_coordinates': model_coords,
            'explained_variance_ratio': explained_variance,
            'scenario_loadings': loadings
        }
    except Exception as e:
        return {'error': str(e)}


def run_analysis(csv_content: str) -> Dict[str, Any]:
    """Run the full analysis pipeline on CSV content."""

    # Parse CSV
    df = parse_csv(csv_content)

    # Identify columns
    model_col, decision_col, scenario_col, dimension_cols = identify_columns(df)

    # Validate required columns exist
    missing = []
    for col in [model_col, decision_col, scenario_col]:
        if col not in df.columns:
            missing.append(col)

    if missing:
        return {
            'error': f"Missing required columns: {missing}",
            'available_columns': list(df.columns)
        }

    # Get metadata
    models = df[model_col].unique().tolist()
    scenarios = df[scenario_col].unique().tolist()

    results = {
        'metadata': {
            'total_rows': len(df),
            'models': models,
            'model_count': len(models),
            'scenarios': scenarios,
            'scenario_count': len(scenarios),
            'dimensions': dimension_cols,
            'dimension_count': len(dimension_cols)
        },
        'basic_stats': compute_basic_stats(df, model_col, decision_col),
        'dimension_analysis': compute_dimension_variance(df, model_col, decision_col, dimension_cols),
        'correlations': compute_model_correlations(df, model_col, decision_col, dimension_cols),
        'inter_model_agreement': compute_inter_model_agreement(df, model_col, decision_col, scenario_col),
        'outlier_detection': detect_outlier_models(df, model_col, decision_col, scenario_col),
        'pca': compute_pca_analysis(df, model_col, decision_col, scenario_col)
    }

    # Generate summary insights
    results['insights'] = generate_insights(results)

    return results


def generate_insights(results: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate human-readable insights from the analysis."""
    insights = []

    # Insight 1: Most influential dimension
    dim_analysis = results.get('dimension_analysis', {})
    ranked_dims = dim_analysis.get('ranked_by_variance', [])
    if ranked_dims:
        top_dim = ranked_dims[0]
        insights.append({
            'type': 'dimension_importance',
            'severity': 'info',
            'title': 'Most Influential Dimension',
            'message': f"'{top_dim['dimension']}' has the highest model divergence (variance: {top_dim['variance']:.3f})",
            'dimension': top_dim['dimension'],
            'variance': top_dim['variance']
        })

    # Insight 2: Dimension with no impact
    if ranked_dims:
        low_impact_dims = [d for d in ranked_dims if d['variance'] < 0.1]
        if low_impact_dims:
            insights.append({
                'type': 'dimension_no_impact',
                'severity': 'warning',
                'title': 'Low-Impact Dimensions',
                'message': f"{len(low_impact_dims)} dimension(s) show minimal model divergence: {', '.join(d['dimension'] for d in low_impact_dims[:3])}",
                'dimensions': [d['dimension'] for d in low_impact_dims]
            })

    # Insight 3: Model outliers
    outlier_data = results.get('outlier_detection', {})
    outlier_ranking = outlier_data.get('outlier_ranking', [])
    outliers = [m for m in outlier_ranking if m.get('outlier_indicators', 0) >= 2]
    if outliers:
        insights.append({
            'type': 'model_outlier',
            'severity': 'alert',
            'title': 'Outlier Model(s) Detected',
            'message': f"Model(s) showing anomalous behavior: {', '.join(m['model'] for m in outliers)}",
            'models': [m['model'] for m in outliers]
        })

    # Insight 4: Model agreement level
    agreement = results.get('inter_model_agreement', {})
    avg_agreement = agreement.get('average_agreement', 0)
    if avg_agreement > 0.8:
        insights.append({
            'type': 'high_agreement',
            'severity': 'success',
            'title': 'High Model Consensus',
            'message': f"Models show strong agreement (avg correlation: {avg_agreement:.2f})",
            'agreement': avg_agreement
        })
    elif avg_agreement < 0.3:
        insights.append({
            'type': 'low_agreement',
            'severity': 'alert',
            'title': 'Low Model Consensus',
            'message': f"Models show significant disagreement (avg correlation: {avg_agreement:.2f})",
            'agreement': avg_agreement
        })

    # Insight 5: Most contested scenario
    contested = agreement.get('most_contested_scenarios', [])
    if contested and contested[0].get('variance', 0) > 1.0:
        top_contested = contested[0]
        insights.append({
            'type': 'contested_scenario',
            'severity': 'warning',
            'title': 'Highly Contested Scenario',
            'message': f"Scenario '{top_contested['scenario']}' shows high disagreement (variance: {top_contested['variance']:.2f})",
            'scenario': top_contested['scenario'],
            'variance': top_contested['variance']
        })

    # Insight 6: Strongest dimension-model correlation
    corr_data = results.get('correlations', {})
    strongest = corr_data.get('strongest_correlations', [])
    if strongest and abs(strongest[0].get('correlation', 0)) > 0.5:
        top_corr = strongest[0]
        direction = "positive" if top_corr['correlation'] > 0 else "negative"
        insights.append({
            'type': 'strong_correlation',
            'severity': 'info',
            'title': 'Strong Dimension-Model Correlation',
            'message': f"'{top_corr['model']}' shows strong {direction} correlation with '{top_corr['dimension']}' (r={top_corr['correlation']:.2f})",
            'model': top_corr['model'],
            'dimension': top_corr['dimension'],
            'correlation': top_corr['correlation']
        })

    return insights


def main():
    parser = argparse.ArgumentParser(description='Deep analysis of model decision data')
    parser.add_argument('input', nargs='?', help='Input CSV file path')
    parser.add_argument('--stdin', action='store_true', help='Read CSV from stdin')
    parser.add_argument('--output', '-o', help='Output JSON file path (default: stdout)')

    args = parser.parse_args()

    # Read input
    if args.stdin:
        csv_content = sys.stdin.read()
    elif args.input:
        with open(args.input, 'r') as f:
            csv_content = f.read()
    else:
        parser.error('Either provide an input file or use --stdin')

    # Run analysis
    results = run_analysis(csv_content)

    # Output results
    output_json = json.dumps(results, indent=2, cls=NumpyJSONEncoder)

    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
    else:
        print(output_json)


if __name__ == '__main__':
    main()
