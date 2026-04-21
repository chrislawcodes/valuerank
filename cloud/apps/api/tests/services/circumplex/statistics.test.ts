import { describe, expect, it } from 'vitest';
import {
  anchorMdsRotation,
  classicalMds2d,
  circumplexFit,
  pearsonCorrelation,
  valueProfileMatrix,
} from '../../../src/services/circumplex/statistics.js';
import { SCHWARTZ_CIRCULAR_ORDER } from '@valuerank/shared/schwartz';

function buildSymmetricMatrix(size: number, fill: (row: number, col: number) => number | null): Array<Array<number | null>> {
  return Array.from({ length: size }, (_unused, row) =>
    Array.from({ length: size }, (_unused2, col) => {
      if (row === col) return 1;
      if (col < row) return fill(col, row);
      return fill(row, col);
    }));
}

describe('pearsonCorrelation', () => {
  it('returns 1 for identical vectors', () => {
    expect(pearsonCorrelation([1, 2, 3], [1, 2, 3])).toBe(1);
    expect(pearsonCorrelation([1, 2, 3], [2, 4, 6])).toBe(1);
  });

  it('returns -1 for opposite vectors', () => {
    expect(pearsonCorrelation([1, 2, 3], [3, 2, 1])).toBe(-1);
  });

  it('returns null for zero variance or too few paired points', () => {
    expect(pearsonCorrelation([1, 1, 1], [2, 3, 4])).toBeNull();
    expect(pearsonCorrelation([1, 2], [2, 4])).toBeNull();
  });

  it('drops null pairs before correlating', () => {
    expect(pearsonCorrelation([1, null, 3, 4, 5], [2, 5, null, 8, 10])).toBe(1);
  });
});

describe('valueProfileMatrix', () => {
  it('finds identical profiles', () => {
    const pairwise = buildSymmetricMatrix(5, (row, col) => {
      const values: Array<Array<number | null>> = [
        [null, 0.7, 0.2, 0.8, 0.4],
        [null, null, 0.2, 0.8, 0.4],
        [null, null, null, 0.5, 0.6],
        [null, null, null, null, 0.2],
        [null, null, null, null, null],
      ];
      return values[row]?.[col] ?? null;
    });
    const trials = buildSymmetricMatrix(5, (row, col) => (row === col ? 0 : 25));
    const matrix = valueProfileMatrix(pairwise.map((row) => row.map((value) => value ?? 0)), trials.map((row) => row.map((value) => value ?? 0)), new Set());

    expect(matrix[0]?.[1]).toBe(1);
    expect(matrix[1]?.[0]).toBe(1);
  });

  it('zeros out excluded rows and columns', () => {
    const pairwise = buildSymmetricMatrix(4, (row, col) => (row === col ? 1 : 0.5));
    const trials = buildSymmetricMatrix(4, (row, col) => (row === col ? 0 : 25));
    const matrix = valueProfileMatrix(pairwise.map((row) => row.map((value) => value ?? 0)), trials.map((row) => row.map((value) => value ?? 0)), new Set([2]));

    expect(matrix[2]).toEqual([null, null, null, null]);
    expect(matrix[0]?.[2]).toBeNull();
    expect(matrix[2]?.[0]).toBeNull();
  });
});

describe('circumplexFit', () => {
  it('returns a clear verdict for strongly monotone data', () => {
    const matrix = Array.from({ length: 10 }, (_unused, row) =>
      Array.from({ length: 10 }, (_unused2, col) => {
        if (row === col) return 1;
        const distance = Math.min(Math.abs(row - col), 10 - Math.abs(row - col));
        return 1 - (distance * 0.25);
      }));

    const result = circumplexFit(matrix, SCHWARTZ_CIRCULAR_ORDER);
    expect(result.rho).not.toBeNull();
    expect(result.rho ?? 0).toBeLessThan(-0.5);
    expect(result.verdict).toBe('clear');
  });

  it('returns a not evident verdict for weakly related data', () => {
    const values = [
      0.1, -0.2, 0.5, -0.4, 0.3,
      -0.1, 0.6, -0.5, 0.2, -0.3,
      0.4, -0.6, 0.15, -0.25, 0.35,
      -0.45, 0.55, -0.35, 0.05, -0.15,
      0.65, -0.05, 0.45, -0.55, 0.25,
      -0.65, 0.15, -0.75, 0.75, -0.85,
      0.85, -0.95, 0.95, -0.05, 0.05,
      -0.15, 0.15, -0.25, 0.25, -0.35,
      0.35, -0.45, 0.45, -0.55, 0.55,
    ];
    let cursor = 0;
    const matrix = Array.from({ length: 10 }, (_unused, row) =>
      Array.from({ length: 10 }, (_unused2, col) => {
        if (row === col) return 1;
        const value = values[cursor] ?? 0;
        cursor += 1;
        return value;
      }));

    const result = circumplexFit(matrix, SCHWARTZ_CIRCULAR_ORDER);
    expect(result.rho).not.toBeNull();
    expect(Math.abs(result.rho ?? 0)).toBeLessThan(0.2);
    expect(result.verdict).toBe('not_evident');
  });

  it('returns insufficient data when fewer than 15 determinate pairs remain', () => {
    const matrix = Array.from({ length: 10 }, (_unused, row) =>
      Array.from({ length: 10 }, (_unused2, col) => {
        if (row === col) return 1;
        if (row < 5 && col < 5) {
          return 0.5;
        }
        return null;
      }));

    const result = circumplexFit(matrix, SCHWARTZ_CIRCULAR_ORDER);
    expect(result.verdict).toBe('insufficient_data');
    expect(result.rho).toBeNull();
    expect(result.p).toBeNull();
  });
});

describe('classicalMds2d', () => {
  it('embeds a square cleanly', () => {
    const points = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ];
    const distances = points.map((left) =>
      points.map((right) => {
        const dx = left[0] - right[0];
        const dy = left[1] - right[1];
        return Math.sqrt((dx * dx) + (dy * dy));
      }));

    const result = classicalMds2d(distances);
    expect(result.warning).toBeNull();
    expect(result.stress).toBeLessThan(0.05);
    expect(result.excluded).toEqual([]);
  });

  it('warns on near-colinear distances', () => {
    const distances = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];

    const result = classicalMds2d(distances);
    expect(result.warning).not.toBeNull();
  });
});

describe('anchorMdsRotation', () => {
  it('rotates Self_Direction_Action to the top when included', () => {
    const coords = [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      null,
      null,
      null,
      null,
      null,
      null,
    ];

    const rotated = anchorMdsRotation(coords, SCHWARTZ_CIRCULAR_ORDER);
    expect(rotated[0]?.x ?? 0).toBeCloseTo(0, 6);
    expect(rotated[0]?.y ?? 0).toBeGreaterThan(0);
  });

  it('falls back to the next included value when Self_Direction_Action is excluded', () => {
    const coords = [
      null,
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0, y: -1 },
      null,
      null,
      null,
      null,
      null,
    ];

    const rotated = anchorMdsRotation(coords, SCHWARTZ_CIRCULAR_ORDER);
    expect(rotated[1]?.x ?? 0).toBeCloseTo(0, 6);
    expect(rotated[1]?.y ?? 0).toBeGreaterThan(0);
  });
});
