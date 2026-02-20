export function normalizeDomainName(name: string): { displayName: string; normalizedName: string } {
  const collapsed = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  return {
    displayName: collapsed,
    normalizedName: collapsed.toLowerCase(),
  };
}
