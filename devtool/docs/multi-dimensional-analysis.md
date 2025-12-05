# Multi-Dimensional Model Divergence Analysis

This document captures research-backed approaches for analyzing model behavior across multiple dimensions in ValueRank experiments.

## Problem Statement

Given data with:
- **Multiple models** (grok, openai, anthropic, etc.)
- **Multiple input dimensions** (N between 1-5)
- **Numeric output** (Decision Code 1-5)

We want to identify:
1. **Dimension sensitivity**: Which dimensions drive divergence between models?
2. **Model outliers**: Which models behave anomalously compared to the group?
3. **Consensus vs. disagreement**: Where do models agree vs. disagree?

---

## 1. Variance-Based Sensitivity Analysis (Sobol Indices)

**Purpose**: Identify which dimensions drive divergence between models

The Sobol method decomposes total output variance into fractions attributable to each input dimension.

### Key Metrics

| Metric | Description |
|--------|-------------|
| **First-order (Sᵢ)** | Contribution of dimension i alone to variance |
| **Total-effect (STᵢ)** | Contribution including all interactions |
| **Interaction (Sᵢⱼ)** | Variance from combined effect of dimensions i and j |

### Interpretation

- High Sᵢ for dimension X → X is a key driver of model decisions
- Low Sᵢ across all dimensions → Models respond uniformly regardless of input
- High STᵢ but low Sᵢ → Dimension i matters through interactions with other dimensions

### Implementation

```python
from SALib.analyze import sobol
from SALib.sample import saltelli

problem = {
    'num_vars': len(dimensions),
    'names': dimensions,
    'bounds': [[1, 5]] * len(dimensions)  # dimension value ranges
}

# Analyze
Si = sobol.analyze(problem, Y, calc_second_order=True)
# Si['S1'] = first-order indices
# Si['ST'] = total-order indices
# Si['S2'] = second-order interaction indices
```

### Sources

- [Saltelli et al. (2010) - Variance Based Sensitivity Analysis of Model Output](https://www.andreasaltelli.eu/file/repository/PUBLISHED_PAPER.pdf)
- [Zhang et al. (2015) - Sobol Sensitivity Analysis for Systems Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5006244/)
- [Wikipedia - Variance-based sensitivity analysis](https://en.wikipedia.org/wiki/Variance-based_sensitivity_analysis)

---

## 2. ANOVA Decomposition

**Purpose**: Quantify dimension vs. model effects statistically

Two-way ANOVA separates variance into:
- **Main effect of dimension**: Does changing dimension X affect output regardless of model?
- **Main effect of model**: Does model Z differ regardless of dimension?
- **Interaction effect**: Does model Z only diverge on specific dimensions?

### Interpretation

| Effect | High F-statistic means... |
|--------|---------------------------|
| Dimension main effect | Dimension significantly impacts decisions |
| Model main effect | Models have systematically different baselines |
| Interaction | Specific model-dimension combinations drive variance |

### Implementation

```python
import statsmodels.api as sm
from statsmodels.formula.api import ols

# Fit two-way ANOVA
model = ols('decision ~ C(dimension) + C(model) + C(dimension):C(model)', data=df).fit()
anova_table = sm.stats.anova_lm(model, typ=2)
```

### Sources

- [Mara & Tarantola (2012) - Variance-based sensitivity indices for models with dependent inputs](https://www.sciencedirect.com/science/article/abs/pii/S0951832011001724)
- [PMC - Variance Decomposition for Sensitivity Analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC4425250/)

---

## 3. Inter-Rater Agreement Metrics

**Purpose**: Measure model consensus/disagreement per dimension

### Metrics

| Metric | Use Case |
|--------|----------|
| **Fleiss' Kappa (κ)** | Agreement among 3+ models on ordinal scales |
| **Krippendorff's Alpha (α)** | Handles missing data, works with interval data |
| **ICC (Intraclass Correlation)** | Best for continuous/ordinal ratings |

### Interpretation

| κ / α Value | Agreement Level |
|-------------|-----------------|
| < 0.20 | Poor |
| 0.21–0.40 | Fair |
| 0.41–0.60 | Moderate |
| 0.61–0.80 | Substantial |
| 0.81–1.00 | Almost perfect |

### Per-Dimension Analysis

Compute κ for each dimension separately. Low κ on dimension Y = high disagreement = that dimension drives divergence.

### Implementation

```python
from statsmodels.stats.inter_rater import fleiss_kappa
import krippendorff

# Fleiss' Kappa (requires matrix of ratings)
kappa = fleiss_kappa(rating_matrix)

# Krippendorff's Alpha (more robust)
alpha = krippendorff.alpha(reliability_data=ratings, level_of_measurement='ordinal')
```

### Sources

- [PMC - Interrater reliability: the kappa statistic](https://pmc.ncbi.nlm.nih.gov/articles/PMC3900052/)
- [Medium - Inter-Annotator Agreement (IAA)](https://medium.com/data-science/inter-annotator-agreement-2f46c6d37bf3)

---

## 4. Model Outlier Detection

### 4a. Mahalanobis Distance

**Purpose**: Find which model is consistently "off" in multi-dimensional space

Mahalanobis distance accounts for correlations between dimensions. A model with high Mahalanobis distance from the centroid is an outlier.

```python
from scipy.spatial.distance import mahalanobis
import numpy as np

# Compute mean and covariance across all models
mean = np.mean(model_response_matrix, axis=0)
cov = np.cov(model_response_matrix.T)
cov_inv = np.linalg.inv(cov)

# Distance for each model
for model_vec in model_response_matrix:
    dist = mahalanobis(model_vec, mean, cov_inv)
```

### 4b. Isolation Forest

**Purpose**: Non-parametric outlier detection when distributions are unknown

```python
from sklearn.ensemble import IsolationForest

clf = IsolationForest(contamination=0.1, random_state=42)
outlier_labels = clf.fit_predict(model_response_matrix)
# -1 = outlier, 1 = normal
```

### Key Insight from Research

> Isolation Forest detects size anomalies while Mahalanobis detects shape anomalies (correlation violations). Use both.

### Sources

- [arXiv - Robust Mahalanobis Distance with Shrinkage Estimators](https://arxiv.org/abs/1904.02596)
- [Leys et al. (2018) - Detecting multivariate outliers](https://www.academia.edu/34706534/Detecting_multivariate_outliers_Use_a_robust_variant_of_the_Mahalanobis_distance)
- [Liu, Ting & Zhou (2008) - Isolation Forest](https://cs.nju.edu.cn/zhouzh/zhouzh.files/publication/icdm08b.pdf)

---

## 5. Jackknife / Leave-One-Out Analysis

**Purpose**: Identify if a single model is driving all observed patterns

Remove one model at a time and recompute statistics. If removing model Z dramatically changes the variance/agreement, model Z is the outlier.

```python
def jackknife_influence(models, data, compute_statistic):
    """Compute influence of each model on a statistic."""
    full_stat = compute_statistic(data)
    influences = {}

    for model in models:
        subset = data[data['model'] != model]
        subset_stat = compute_statistic(subset)
        influences[model] = full_stat - subset_stat

    return influences
```

### Sources

- [JMP Community - Outliers using Jackknife Distance](https://community.jmp.com/t5/JMP-Blog/Outliers-Episode-4-Detecting-outliers-using-jackknife-distance/ba-p/364613)
- [SAGE - Jackknife Method](https://methods.sagepub.com/reference/encyc-of-research-design/n202.xml)

---

## 6. SHAP-Inspired Dimension Attribution

**Purpose**: Decompose each model's prediction into dimension contributions

For each model, compute how much each dimension contributed to its deviation from consensus.

```python
import shap

# Build a simple model predicting decisions from dimensions
X = df[dimension_columns]
y = df['decision']

model = sklearn.ensemble.RandomForestRegressor()
model.fit(X, y)

explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(X)

# Plot feature importance
shap.summary_plot(shap_values, X)
```

### Sources

- [Lundberg & Lee (2017) - SHAP documentation](https://shap.readthedocs.io/en/latest/)
- [Christoph Molnar - Interpretable ML Book: SHAP](https://christophm.github.io/interpretable-ml-book/shap.html)

---

## 7. Visualization Techniques

### Clustered Heatmaps with Dendrograms

Rows = models, columns = scenarios/dimensions, cells = decisions.

**Reveals**:
- Which models cluster together (outliers appear as singletons)
- Which dimensions have uniform color (no variance) vs. varied color (high divergence)

```python
import seaborn as sns

# Create heatmap with hierarchical clustering
g = sns.clustermap(
    model_decision_matrix,
    method='ward',
    cmap='RdYlBu_r',
    figsize=(12, 8)
)
```

### PCA Biplots

Project models into 2D space where:
- **Points** = models (outlier models appear distant)
- **Vectors** = dimensions (vector length = importance, direction = correlation)

```python
from sklearn.decomposition import PCA

pca = PCA(n_components=2)
model_coords = pca.fit_transform(model_response_matrix)

# Plot models as points
plt.scatter(model_coords[:, 0], model_coords[:, 1])

# Plot dimension loadings as vectors
for i, dim in enumerate(dimensions):
    plt.arrow(0, 0, pca.components_[0, i], pca.components_[1, i])
```

### Parallel Coordinates

Each line = one scenario. Each vertical axis = one dimension or model decision.

**Reveals**: Which models track together vs. diverge on specific scenarios.

### Sources

- [BMC Bioinformatics - Unboxing Cluster Heatmaps](https://bmcbioinformatics.biomedcentral.com/articles/10.1186/s12859-016-1442-6)
- [Python Data Science Handbook - PCA](https://jakevdp.github.io/PythonDataScienceHandbook/05.09-principal-component-analysis.html)

---

## Recommended Analysis Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. DESCRIPTIVE                                             │
│     • Clustered heatmap (models × scenarios)                │
│     • Per-dimension variance across models                  │
│     • Basic statistics (mean, std, range per model)         │
├─────────────────────────────────────────────────────────────┤
│  2. DIMENSION IMPORTANCE                                    │
│     • Sobol indices for dimension sensitivity               │
│     • Two-way ANOVA (model × dimension interaction)         │
│     • Krippendorff's α per dimension                        │
├─────────────────────────────────────────────────────────────┤
│  3. MODEL OUTLIERS                                          │
│     • Mahalanobis distance from group centroid              │
│     • Isolation Forest anomaly scores                       │
│     • Jackknife: influence of removing each model           │
├─────────────────────────────────────────────────────────────┤
│  4. VISUALIZATION                                           │
│     • PCA biplot (models as points, dimensions as vectors)  │
│     • Parallel coordinates plot colored by model            │
│     • Dimension × model interaction heatmap                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Python Libraries

| Technique | Library |
|-----------|---------|
| Sobol indices | `SALib` |
| ANOVA | `statsmodels.stats.anova` |
| ICC / Fleiss Kappa | `pingouin`, `statsmodels` |
| Krippendorff's Alpha | `krippendorff` |
| Mahalanobis | `scipy.spatial.distance` |
| Isolation Forest | `sklearn.ensemble` |
| SHAP | `shap` |
| Heatmaps | `seaborn.clustermap` |
| PCA | `sklearn.decomposition.PCA` |

---

## Integration with ValueRank DevTool

The analysis is exposed via:
1. **Python script**: `devtool/scripts/deep_analysis.py`
2. **Server endpoint**: `POST /api/analysis/deep` (accepts CSV, returns analysis results)
3. **Frontend**: "Deep Analysis" tab in the Analysis view
