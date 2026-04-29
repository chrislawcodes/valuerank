type Props = {
  flag: 'ceiling' | 'floor' | null | undefined;
};

export function CeilingFloorBadge({ flag }: Props) {
  if (flag == null) return null;
  return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">{flag}</span>;
}
