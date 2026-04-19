/**
 * DAYMAKER CONNECT — RM Context Block
 *
 * Renders the user's Reflections Match persona into a prompt-ready block
 * that can be appended to any AI system prompt. Safe to call with an empty
 * user doc: returns '' when RM is not connected.
 */

import type { DaymakerUser, RmActiveTheme, RmExpertiseArea } from '@/lib/types';

export interface RmContextFields {
  rmConnected?: boolean;
  rmPersonaTraits?: string[];
  rmNorthStar?: string | null;
  rmExpertise?: RmExpertiseArea[];
  rmActiveThemes?: RmActiveTheme[];
  rmStrategicContext?: string | null;
  rmTrackingInterests?: string[];
}

/**
 * Build a compact markdown block describing the user's Reflections Match
 * persona for inclusion in AI system prompts. Returns '' if RM is not
 * connected or the payload has no meaningful content.
 */
export function buildRmContextBlock(user: RmContextFields | null | undefined): string {
  if (!user || !user.rmConnected) return '';

  const lines: string[] = [];

  if (user.rmNorthStar) {
    lines.push(`- North Star (Reflections Match): ${user.rmNorthStar}`);
  }

  if (user.rmPersonaTraits && user.rmPersonaTraits.length > 0) {
    lines.push(`- Core traits: ${user.rmPersonaTraits.join(', ')}`);
  }

  if (user.rmExpertise && user.rmExpertise.length > 0) {
    const top = user.rmExpertise.slice(0, 8).map(e => {
      const years = e.yearsOfExperience != null ? `, ${e.yearsOfExperience}y` : '';
      return `${e.area} (${e.depth}${years})`;
    });
    lines.push(`- Expertise: ${top.join('; ')}`);
  }

  if (user.rmActiveThemes && user.rmActiveThemes.length > 0) {
    const strong = user.rmActiveThemes
      .filter(t => t.strength === 'high' || t.strength === 'medium')
      .slice(0, 6)
      .map(t => `${t.theme} (${t.strength})`);
    if (strong.length) lines.push(`- Active themes: ${strong.join(', ')}`);
  }

  if (user.rmTrackingInterests && user.rmTrackingInterests.length > 0) {
    lines.push(`- Tracking interests: ${user.rmTrackingInterests.join(', ')}`);
  }

  if (user.rmStrategicContext) {
    lines.push(`- Strategic context: ${user.rmStrategicContext}`);
  }

  if (lines.length === 0) return '';

  return `\n### Reflections Match Persona\nUse this as the authoritative picture of who the user is. Personalize recommendations, conversation starters, and priorities to these interests, themes, and areas of expertise:\n${lines.join('\n')}\n`;
}

/** Convenience wrapper for when you've already loaded the full user doc. */
export function buildRmContextBlockFromUser(user: Partial<DaymakerUser> | null | undefined): string {
  return buildRmContextBlock(user as RmContextFields | null | undefined);
}
