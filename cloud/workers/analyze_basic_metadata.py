"""Metadata constants and methods-used block emitted by analyze_basic.py.

Extracted from analyze_basic.py to keep that script under the 400-line
file-size limit. Pure metadata - no behavior.
"""

CODE_VERSION = "1.3.0"
SUMMARY_CONTRACT_VERSION = "vignette-semantics-v1"


def build_methods_used() -> dict:
    """Return the methodsUsed metadata block for an analysis output."""
    return {
        "modelComparison": "spearman_rho",
        "pValueCorrection": "holm_bonferroni",
        "effectSize": "cohens_d",
        "dimensionTest": "kruskal_wallis",
        "varianceMetrics": "sample_variance",
        "alpha": 0.05,
        "codeVersion": CODE_VERSION,
        "summaryContractVersion": SUMMARY_CONTRACT_VERSION,
    }
