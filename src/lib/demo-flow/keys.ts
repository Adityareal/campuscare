/**
 * Roving focus for a WAI-ARIA tab list. Returns the index to focus next, or null when the key is
 * not a navigation key. Disabled tabs are skipped; `enabled` says which indexes can take focus.
 */
export function nextEnabledIndex(key: string, current: number, enabled: readonly boolean[]): number | null {
  const count = enabled.length;
  if (count === 0) return null;
  const find = (from: number, step: 1 | -1): number => {
    for (let i = 1; i <= count; i++) {
      const idx = (((from + step * i) % count) + count) % count;
      if (enabled[idx]) return idx;
    }
    return current;
  };
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return find(current, 1);
    case "ArrowLeft":
    case "ArrowUp":
      return find(current, -1);
    case "Home":
      return enabled.findIndex(Boolean);
    case "End":
      return enabled.lastIndexOf(true);
    default:
      return null;
  }
}
