export function normalizeDomainName(name: string): { displayName: string; normalizedName: string } {
  const collapsed = name.trim().replace(/\s+/g, ' ');
  return {
    displayName: collapsed,
    normalizedName: collapsed.toLowerCase(),
  };
}
