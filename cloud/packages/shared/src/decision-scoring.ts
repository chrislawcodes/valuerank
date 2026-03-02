export type DecisionDirection = 'A' | 'B' | 'NEUTRAL';

export function bucketDecisionDirection(decision: string | null): DecisionDirection | null {
  if (decision === '4' || decision === '5') return 'A';
  if (decision === '1' || decision === '2') return 'B';
  if (decision === '3') return 'NEUTRAL';
  return null;
}

export function decisionsMatch(
  batch1: string | null,
  batch2: string | null,
  batch3: string | null,
  directionOnly: boolean,
): boolean {
  if (batch1 == null || batch2 == null || batch3 == null) return false;
  if (!directionOnly) return batch1 === batch2 && batch2 === batch3;
  return (
    bucketDecisionDirection(batch1) === bucketDecisionDirection(batch2) &&
    bucketDecisionDirection(batch2) === bucketDecisionDirection(batch3)
  );
}
