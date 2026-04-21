import { type ValueKey } from '@valuerank/shared/schwartz';

type Point = { x: number; y: number };

type EigenDecomposition = {
  eigenvalues: number[];
  eigenvectors: number[][];
};

type EigenPair = {
  value: number;
  vector: number[];
};

function identityMatrix(size: number): number[][] {
  return Array.from({ length: size }, (_unused, row) =>
    Array.from({ length: size }, (_unused2, col) => (row === col ? 1 : 0)));
}

function cloneMatrix(matrix: number[][]): number[][] {
  return matrix.map((row) => [...row]);
}

function jacobiEigenDecomposition(input: number[][]): EigenDecomposition {
  const n = input.length;
  const a = cloneMatrix(input);
  const v = identityMatrix(n);
  const maxIterations = 100;
  const epsilon = 1e-12;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let p = 0;
    let q = 1;
    let maxValue = 0;

    for (let row = 0; row < n; row += 1) {
      for (let col = row + 1; col < n; col += 1) {
        const value = Math.abs(a[row]![col]!);
        if (value > maxValue) {
          maxValue = value;
          p = row;
          q = col;
        }
      }
    }

    if (maxValue < epsilon) {
      break;
    }

    const app = a[p]![p]!;
    const aqq = a[q]![q]!;
    const apq = a[p]![q]!;
    if (Math.abs(apq) < epsilon) {
      continue;
    }

    const tau = (aqq - app) / (2 * apq);
    const sign = tau >= 0 ? 1 : -1;
    const t = sign / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;
    const tauPrime = s / (1 + c);

    a[p]![p] = app - t * apq;
    a[q]![q] = aqq + t * apq;
    a[p]![q] = 0;
    a[q]![p] = 0;

    for (let row = 0; row < n; row += 1) {
      if (row === p || row === q) continue;
      const arp = a[row]![p]!;
      const arq = a[row]![q]!;
      const nextArp = arp - s * (arq + tauPrime * arp);
      const nextArq = arq + s * (arp - tauPrime * arq);
      a[row]![p] = nextArp;
      a[p]![row] = nextArp;
      a[row]![q] = nextArq;
      a[q]![row] = nextArq;
    }

    for (let row = 0; row < n; row += 1) {
      const vrp = v[row]![p]!;
      const vrq = v[row]![q]!;
      v[row]![p] = c * vrp - s * vrq;
      v[row]![q] = s * vrp + c * vrq;
    }
  }

  const eigenvalues = Array.from({ length: n }, (_unused, index) => a[index]![index]!);
  return { eigenvalues, eigenvectors: v };
}

function isIncludedIndex(distanceMatrix: (number | null)[][], index: number): boolean {
  return distanceMatrix[index]?.some((value) => value != null) ?? false;
}

function centerDistanceMatrix(distanceMatrix: number[][]): number[][] {
  const n = distanceMatrix.length;
  const rowMeans = distanceMatrix.map((row) => row.reduce((sum, value) => sum + value, 0) / n);
  const grandMean = rowMeans.reduce((sum, value) => sum + value, 0) / n;

  return Array.from({ length: n }, (_unused, rowIndex) =>
    Array.from({ length: n }, (_unused2, colIndex) => (
      -0.5 * (
        distanceMatrix[rowIndex]![colIndex]!
        - rowMeans[rowIndex]!
        - rowMeans[colIndex]!
        + grandMean
      )
    )));
}

export function classicalMds2d(distanceMatrix: (number | null)[][]): {
  coords: Array<Point | null>;
  stress: number;
  excluded: number[];
  warning: string | null;
} {
  const size = distanceMatrix.length;
  const excluded = Array.from({ length: size }, (_unused, index) => index).filter((index) => !isIncludedIndex(distanceMatrix, index));
  const included = Array.from({ length: size }, (_unused, index) => index).filter((index) => !excluded.includes(index));

  if (included.length === 0) {
    return {
      coords: Array.from({ length: size }, () => null),
      stress: 0,
      excluded,
      warning: 'No values have enough determinate data for a 2D embedding.',
    };
  }

  const reduced = included.map((rowIndex) =>
    included.map((colIndex) => {
      const value = distanceMatrix[rowIndex]![colIndex];
      if (value == null) {
        return 0;
      }
      return value * value;
    }));

  const centered = centerDistanceMatrix(reduced);
  const { eigenvalues, eigenvectors } = jacobiEigenDecomposition(centered);
  const ranked: EigenPair[] = eigenvalues
    .map((value, index) => ({ value, vector: eigenvectors.map((row) => row[index] ?? 0) }))
    .sort((left, right) => right.value - left.value);

  const totalAbsEigenvalue = eigenvalues.reduce((sum, value) => sum + Math.abs(value), 0);
  const first = ranked[0]?.value ?? 0;
  const second = ranked[1]?.value ?? 0;
  const topTwoShare = totalAbsEigenvalue <= 0 ? 0 : (Math.max(0, first) + Math.max(0, second)) / totalAbsEigenvalue;
  const warning = topTwoShare < 0.5
    ? '2D embedding does not cleanly represent this model\'s correlation structure.'
    : null;

  const firstScale = Math.sqrt(Math.max(0, first));
  const secondScale = Math.sqrt(Math.max(0, second));

  const reducedCoords = included.map((rowIndex) => {
    const x = firstScale * (ranked[0]?.vector[rowIndex] ?? 0);
    const y = secondScale * (ranked[1]?.vector[rowIndex] ?? 0);
    return { x, y };
  });

  let residualSum = 0;
  let inputSum = 0;
  for (let i = 0; i < reducedCoords.length; i += 1) {
    for (let j = i + 1; j < reducedCoords.length; j += 1) {
      const inputDistance = Math.sqrt(reduced[i]![j] ?? 0);
      const dx = reducedCoords[i]!.x - reducedCoords[j]!.x;
      const dy = reducedCoords[i]!.y - reducedCoords[j]!.y;
      const embeddedDistance = Math.sqrt(dx * dx + dy * dy);
      residualSum += Math.pow(inputDistance - embeddedDistance, 2);
      inputSum += Math.pow(inputDistance, 2);
    }
  }

  const coords = Array.from({ length: size }, () => null as Point | null);
  included.forEach((index, coordIndex) => {
    coords[index] = reducedCoords[coordIndex] ?? null;
  });

  return {
    coords,
    stress: inputSum <= 0 ? 0 : residualSum / inputSum,
    excluded,
    warning,
  };
}

export function anchorMdsRotation(
  coords: Array<Point | null>,
  canonicalOrder: readonly ValueKey[],
  anchorKey: ValueKey = 'Self_Direction_Action',
): Array<Point | null> {
  const startIndex = canonicalOrder.indexOf(anchorKey);
  if (startIndex < 0) {
    return coords;
  }

  let anchorIndex = -1;
  for (let offset = 0; offset < canonicalOrder.length; offset += 1) {
    const candidateIndex = (startIndex + offset) % canonicalOrder.length;
    if (coords[candidateIndex] != null) {
      anchorIndex = candidateIndex;
      break;
    }
  }

  if (anchorIndex < 0) {
    return coords;
  }

  const anchor = coords[anchorIndex];
  if (anchor == null) {
    return coords;
  }

  const angle = Math.atan2(anchor.x, anchor.y);
  const rotation = angle;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return coords.map((point) => {
    if (point == null) return null;
    return {
      x: (point.x * cos) - (point.y * sin),
      y: (point.x * sin) + (point.y * cos),
    };
  });
}
