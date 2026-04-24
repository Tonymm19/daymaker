/**
 * Helpers for reading and formatting a user's North Star goals.
 *
 * Schema background: users originally had a single `northStar: string` field.
 * We now support up to three simultaneous goals stored on `northStarGoals`.
 * Reads fall back to `northStar` for backward compatibility so any user doc
 * that hasn't been re-saved since multi-goal shipped still works.
 */

export const MAX_NORTH_STAR_GOALS = 3;

export const DEFAULT_GOAL_FALLBACK = 'Building a robust, high-value professional network.';

/** Returns a deduplicated, trimmed, non-empty list of up to MAX goals. */
export function getNorthStarGoals(userDoc: {
  northStar?: string | null;
  northStarGoals?: string[] | null;
}): string[] {
  const arr = Array.isArray(userDoc.northStarGoals) ? userDoc.northStarGoals : [];
  const fromArray = arr
    .map((g) => (typeof g === 'string' ? g.trim() : ''))
    .filter((g) => g.length > 0);

  if (fromArray.length > 0) return fromArray.slice(0, MAX_NORTH_STAR_GOALS);

  const single = typeof userDoc.northStar === 'string' ? userDoc.northStar.trim() : '';
  return single ? [single] : [];
}

/**
 * Formats goals for a prompt block. Single-goal users get the old-style
 * one-line format so existing single-goal prompt language continues to read
 * naturally; multi-goal users get a numbered list.
 */
export function formatGoalsForPrompt(
  goals: string[],
  fallback: string = DEFAULT_GOAL_FALLBACK,
): string {
  if (goals.length === 0) return fallback;
  if (goals.length === 1) return goals[0];
  return goals.map((g, i) => `  ${i + 1}. ${g}`).join('\n');
}

/**
 * Produces the short label for the goals block heading. Reads either
 * "North Star Goal" (singular) or "North Star Goals" (plural) based on count.
 */
export function goalBlockLabel(goals: string[]): string {
  return goals.length > 1 ? 'North Star Goals' : 'North Star Goal';
}
