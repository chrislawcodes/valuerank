function normalizeTemperatureToken(temperature: number): string {
  return temperature.toFixed(3).replace(/\.?0+$/, '');
}

export function isVnewSignature(signature: string | null | undefined): boolean {
  return typeof signature === 'string' && signature.startsWith('vnewt');
}

export function parseVnewTemperature(signature: string): number | null {
  if (!isVnewSignature(signature)) {
    throw new Error(`Not a vnew signature: ${signature}`);
  }
  const token = signature.slice('vnewt'.length).trim();
  if (token === 'd') return null;
  const parsed = Number.parseFloat(token);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid vnew signature temperature token: ${signature}`);
  }
  return parsed;
}

export function formatVnewSignature(temperature: number | null): string {
  if (temperature === null || !Number.isFinite(temperature)) {
    return 'vnewtd';
  }
  return `vnewt${normalizeTemperatureToken(temperature)}`;
}

export function formatVnewLabel(temperature: number | null): string {
  if (temperature === null || !Number.isFinite(temperature)) {
    return 'Latest @ default';
  }
  return `Latest @ t=${normalizeTemperatureToken(temperature)}`;
}
