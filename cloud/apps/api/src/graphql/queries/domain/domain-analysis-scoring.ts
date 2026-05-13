export function computeSmoothedLogOddsScore(wins: number, losses: number): number {
  return Math.log((wins + 1) / (losses + 1));
}

export function computeLogOddsFromWinRate(winRatePct: number): number {
  const p = winRatePct / 100;
  return Math.log(p / (1 - p));
}
