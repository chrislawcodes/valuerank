export type LockedAssumptionVignette = {
  id: string;
  title: string;
  rationale: string;
};

export const LOCKED_ASSUMPTION_VIGNETTES: readonly LockedAssumptionVignette[] = [
  {
    id: 'cmlsmyn9l0j3rxeiricruouia',
    title: 'Jobs (Self Direction Action vs Power Dominance)',
    rationale: 'Covers autonomy vs hierarchy in a clean professional tradeoff.',
  },
  {
    id: 'cmlsn0pnr0jg1xeir147758pr',
    title: 'Jobs (Security Personal vs Conformity Interpersonal)',
    rationale: 'Covers stability vs social-pressure alignment without overlapping values.',
  },
  {
    id: 'cmlsn216u0jpfxeirpdbrm9so',
    title: 'Jobs (Tradition vs Stimulation)',
    rationale: 'Covers heritage vs novelty with highly legible role framing.',
  },
  {
    id: 'cmlsn2tca0jvxxeir5r0i5civ',
    title: 'Jobs (Benevolence Dependability vs Universalism Nature)',
    rationale: 'Covers responsibility to others vs nature protection with distinct moral texture.',
  },
  {
    id: 'cmlsn384i0jzjxeir9or2w35z',
    title: 'Jobs (Achievement vs Hedonism)',
    rationale: 'Covers achievement vs enjoyment and rounds out the 10-value package.',
  },
] as const;
