"""
Unit tests for deep_analysis.py
"""

import pytest
import json
import numpy as np
import pandas as pd
from io import StringIO

from deep_analysis import (
    NumpyJSONEncoder,
    parse_csv,
    identify_columns,
    compute_basic_stats,
    compute_dimension_variance,
    compute_model_correlations,
    compute_inter_model_agreement,
    detect_outlier_models,
    compute_pca_analysis,
    run_analysis,
    generate_insights,
)


# Sample test data
SAMPLE_CSV = """Scenario,AI Model Name,Decision Code,Decision Text,Severity,Cost
scenario_001,GPT-4,3,Moderate response,1,2
scenario_001,Claude,4,Strong response,1,2
scenario_002,GPT-4,2,Weak response,2,1
scenario_002,Claude,2,Weak response,2,1
scenario_003,GPT-4,5,Very strong,3,3
scenario_003,Claude,3,Moderate response,3,3
scenario_004,GPT-4,4,Strong,1,3
scenario_004,Claude,4,Strong,1,3
scenario_005,GPT-4,1,Minimal,2,2
scenario_005,Claude,5,Maximum,2,2"""


class TestNumpyJSONEncoder:
    def test_encodes_numpy_int(self):
        data = {'value': np.int64(42)}
        result = json.dumps(data, cls=NumpyJSONEncoder)
        assert result == '{"value": 42}'

    def test_encodes_numpy_float(self):
        data = {'value': np.float64(3.14)}
        result = json.dumps(data, cls=NumpyJSONEncoder)
        assert '3.14' in result

    def test_encodes_numpy_bool(self):
        data = {'value': np.bool_(True)}
        result = json.dumps(data, cls=NumpyJSONEncoder)
        assert result == '{"value": true}'

    def test_encodes_numpy_array(self):
        data = {'values': np.array([1, 2, 3])}
        result = json.dumps(data, cls=NumpyJSONEncoder)
        assert result == '{"values": [1, 2, 3]}'


class TestParseCSV:
    def test_parses_csv_to_dataframe(self):
        df = parse_csv(SAMPLE_CSV)
        assert isinstance(df, pd.DataFrame)
        assert len(df) == 10

    def test_preserves_columns(self):
        df = parse_csv(SAMPLE_CSV)
        assert 'Scenario' in df.columns
        assert 'AI Model Name' in df.columns
        assert 'Decision Code' in df.columns
        assert 'Severity' in df.columns
        assert 'Cost' in df.columns


class TestIdentifyColumns:
    def test_identifies_known_columns(self):
        df = parse_csv(SAMPLE_CSV)
        model_col, decision_col, scenario_col, dim_cols = identify_columns(df)

        assert model_col == 'AI Model Name'
        assert decision_col == 'Decision Code'
        assert scenario_col == 'Scenario'

    def test_identifies_dimension_columns(self):
        df = parse_csv(SAMPLE_CSV)
        _, _, _, dim_cols = identify_columns(df)

        assert 'Severity' in dim_cols
        assert 'Cost' in dim_cols
        assert 'Scenario' not in dim_cols
        assert 'AI Model Name' not in dim_cols
        assert 'Decision Code' not in dim_cols
        assert 'Decision Text' not in dim_cols


class TestComputeBasicStats:
    def test_computes_stats_per_model(self):
        df = parse_csv(SAMPLE_CSV)
        stats = compute_basic_stats(df, 'AI Model Name', 'Decision Code')

        assert 'GPT-4' in stats
        assert 'Claude' in stats

    def test_stats_contain_expected_fields(self):
        df = parse_csv(SAMPLE_CSV)
        stats = compute_basic_stats(df, 'AI Model Name', 'Decision Code')

        gpt4_stats = stats['GPT-4']
        assert 'mean' in gpt4_stats
        assert 'std' in gpt4_stats
        assert 'min' in gpt4_stats
        assert 'max' in gpt4_stats
        assert 'median' in gpt4_stats
        assert 'count' in gpt4_stats

    def test_stats_values_are_correct(self):
        df = parse_csv(SAMPLE_CSV)
        stats = compute_basic_stats(df, 'AI Model Name', 'Decision Code')

        # GPT-4 decisions: 3, 2, 5, 4, 1 -> mean = 3.0
        assert stats['GPT-4']['mean'] == 3.0
        assert stats['GPT-4']['min'] == 1.0
        assert stats['GPT-4']['max'] == 5.0
        assert stats['GPT-4']['count'] == 5


class TestComputeDimensionVariance:
    def test_returns_analysis_for_each_dimension(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_dimension_variance(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'per_dimension' in result
        assert 'Severity' in result['per_dimension']
        assert 'Cost' in result['per_dimension']

    def test_returns_ranked_dimensions(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_dimension_variance(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'ranked_by_variance' in result
        assert len(result['ranked_by_variance']) > 0
        for item in result['ranked_by_variance']:
            assert 'dimension' in item
            assert 'variance' in item

    def test_flags_high_variance_dimensions(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_dimension_variance(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        for dim_name, dim_data in result['per_dimension'].items():
            assert 'drives_divergence' in dim_data
            assert 'overall_variance' in dim_data


class TestComputeModelCorrelations:
    def test_returns_correlation_matrix(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_model_correlations(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'matrix' in result
        assert 'Severity' in result['matrix']
        assert 'Cost' in result['matrix']

    def test_correlations_for_each_model(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_model_correlations(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'GPT-4' in result['matrix']['Severity']
        assert 'Claude' in result['matrix']['Severity']

    def test_correlation_contains_expected_fields(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_model_correlations(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        corr_data = result['matrix']['Severity']['GPT-4']
        assert 'correlation' in corr_data
        assert 'p_value' in corr_data
        assert 'significant' in corr_data

    def test_returns_strongest_correlations(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_model_correlations(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'strongest_correlations' in result
        assert len(result['strongest_correlations']) <= 10

    def test_returns_most_divisive_dimensions(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_model_correlations(df, 'AI Model Name', 'Decision Code', ['Severity', 'Cost'])

        assert 'most_divisive_dimensions' in result


class TestComputeInterModelAgreement:
    def test_returns_pairwise_agreement(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_inter_model_agreement(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'pairwise_agreement' in result
        assert 'GPT-4 <-> Claude' in result['pairwise_agreement']

    def test_returns_average_agreement(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_inter_model_agreement(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'average_agreement' in result
        assert -1 <= result['average_agreement'] <= 1

    def test_returns_per_scenario_disagreement(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_inter_model_agreement(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'per_scenario_disagreement' in result
        for scenario, data in result['per_scenario_disagreement'].items():
            assert 'variance' in data
            assert 'range' in data
            assert 'decisions' in data

    def test_returns_most_contested_scenarios(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_inter_model_agreement(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'most_contested_scenarios' in result
        assert len(result['most_contested_scenarios']) <= 10


class TestDetectOutlierModels:
    def test_returns_outlier_analysis(self):
        # Need more models for meaningful outlier detection
        csv_with_more_models = """Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,3,Response
scenario_001,Model_B,3,Response
scenario_001,Model_C,5,Response
scenario_002,Model_A,2,Response
scenario_002,Model_B,2,Response
scenario_002,Model_C,5,Response
scenario_003,Model_A,4,Response
scenario_003,Model_B,4,Response
scenario_003,Model_C,1,Response"""

        df = parse_csv(csv_with_more_models)
        result = detect_outlier_models(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'mahalanobis_distances' in result
        assert 'isolation_forest' in result
        assert 'jackknife_influence' in result
        assert 'outlier_ranking' in result

    def test_handles_insufficient_models(self):
        csv_with_two_models = """Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,3,Response
scenario_001,Model_B,4,Response"""

        df = parse_csv(csv_with_two_models)
        result = detect_outlier_models(df, 'AI Model Name', 'Decision Code', 'Scenario')

        # Should return error or handle gracefully
        assert 'error' in result or 'outlier_ranking' in result


class TestComputePCAAnalysis:
    def test_returns_pca_results(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_pca_analysis(df, 'AI Model Name', 'Decision Code', 'Scenario')

        assert 'model_coordinates' in result
        assert 'explained_variance_ratio' in result
        assert 'scenario_loadings' in result

    def test_model_coordinates_have_x_y(self):
        df = parse_csv(SAMPLE_CSV)
        result = compute_pca_analysis(df, 'AI Model Name', 'Decision Code', 'Scenario')

        for model, coords in result['model_coordinates'].items():
            assert 'x' in coords
            assert 'y' in coords

    def test_handles_insufficient_models(self):
        csv_with_one_model = """Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,3,Response
scenario_002,Model_A,4,Response"""

        df = parse_csv(csv_with_one_model)
        result = compute_pca_analysis(df, 'AI Model Name', 'Decision Code', 'Scenario')

        # Should return error for insufficient models
        assert 'error' in result


class TestRunAnalysis:
    def test_returns_complete_analysis(self):
        result = run_analysis(SAMPLE_CSV)

        assert 'metadata' in result
        assert 'basic_stats' in result
        assert 'dimension_analysis' in result
        assert 'correlations' in result
        assert 'inter_model_agreement' in result
        assert 'outlier_detection' in result
        assert 'pca' in result
        assert 'insights' in result

    def test_metadata_contains_counts(self):
        result = run_analysis(SAMPLE_CSV)

        assert result['metadata']['total_rows'] == 10
        assert result['metadata']['model_count'] == 2
        assert result['metadata']['scenario_count'] == 5
        assert result['metadata']['dimension_count'] == 2

    def test_handles_missing_columns(self):
        bad_csv = """Column1,Column2
value1,value2"""

        result = run_analysis(bad_csv)

        assert 'error' in result
        assert 'available_columns' in result


class TestGenerateInsights:
    def test_generates_insights_list(self):
        result = run_analysis(SAMPLE_CSV)
        insights = result['insights']

        assert isinstance(insights, list)

    def test_insights_have_required_fields(self):
        result = run_analysis(SAMPLE_CSV)
        insights = result['insights']

        for insight in insights:
            assert 'type' in insight
            assert 'severity' in insight
            assert 'title' in insight
            assert 'message' in insight

    def test_insight_types_are_valid(self):
        result = run_analysis(SAMPLE_CSV)
        insights = result['insights']

        valid_types = {
            'dimension_importance',
            'dimension_no_impact',
            'model_outlier',
            'high_agreement',
            'low_agreement',
            'contested_scenario',
            'strong_correlation',
        }

        for insight in insights:
            assert insight['type'] in valid_types

    def test_insight_severities_are_valid(self):
        result = run_analysis(SAMPLE_CSV)
        insights = result['insights']

        valid_severities = {'info', 'success', 'warning', 'alert'}

        for insight in insights:
            assert insight['severity'] in valid_severities


class TestEdgeCases:
    def test_handles_empty_csv(self):
        empty_csv = "Scenario,AI Model Name,Decision Code,Decision Text"
        result = run_analysis(empty_csv)

        # Should handle gracefully without crashing
        assert 'metadata' in result or 'error' in result

    def test_handles_nan_values(self):
        csv_with_nan = """Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,3,Response
scenario_002,Model_A,,Missing
scenario_003,Model_A,5,Response"""

        df = parse_csv(csv_with_nan)
        # Should not crash
        stats = compute_basic_stats(df, 'AI Model Name', 'Decision Code')
        assert 'Model_A' in stats

    def test_handles_single_scenario(self):
        single_scenario = """Scenario,AI Model Name,Decision Code,Decision Text
scenario_001,Model_A,3,Response
scenario_001,Model_B,4,Response"""

        result = run_analysis(single_scenario)

        # Should handle without crashing
        assert 'metadata' in result


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
