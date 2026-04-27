import { describe, expect, it } from 'vitest';
import { computeLaunchTrialCount } from '../src/launch-trial-count.js';

describe('computeLaunchTrialCount', () => {
  it('matches the percentage-sampling math used by the backend', () => {
    const scenarioIds = Array.from({ length: 10 }, (_, index) => `s${index + 1}`);
    const expectedScenarios = Math.max(1, Math.floor((scenarioIds.length * 50) / 100));

    expect(expectedScenarios).toBe(5);
    expect(
      computeLaunchTrialCount({
        scenarioCount: scenarioIds.length,
        samplePercentage: 50,
        samplesPerScenario: 2,
        modelCount: 3,
      }),
    ).toBe(30);
  });

  it('uses floor, not ceil, when sampling below 100%', () => {
    expect(
      computeLaunchTrialCount({
        scenarioCount: 3,
        samplePercentage: 50,
        samplesPerScenario: 1,
        modelCount: 1,
      }),
    ).toBe(1);
  });

  it('uses explicit scenarioIds when present and falls back when empty', () => {
    expect(
      computeLaunchTrialCount({
        scenarioCount: 20,
        samplePercentage: 10,
        samplesPerScenario: 2,
        scenarioIds: ['s1', 's2', 's3'],
        modelCount: 4,
      }),
    ).toBe(24);

    expect(
      computeLaunchTrialCount({
        scenarioCount: 20,
        samplePercentage: 10,
        samplesPerScenario: 2,
        scenarioIds: [],
        modelCount: 4,
      }),
    ).toBe(16);
  });
});
