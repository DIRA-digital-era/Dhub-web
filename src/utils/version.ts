/**
 * Compares two semantic version strings.
 * @param v1 First version string (e.g., '1.0.0')
 * @param v2 Second version string (e.g., '1.1.0')
 * @returns -1 if v1 < v2, 1 if v1 > v2, 0 if equal.
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}
