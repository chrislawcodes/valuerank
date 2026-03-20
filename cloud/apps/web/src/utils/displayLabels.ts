export function formatDisplayLabel(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value).replace(/_/g, ' ').trim();
}
