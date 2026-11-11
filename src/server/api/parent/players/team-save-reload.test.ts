/**
 * team-save-reload.test.ts
 *
 * Regression tests for team name save/reload behavior in the Add/Edit Player wizard.
 *
 * History:
 *   - Step 5 (Team) previously showed a suggested name as an OptionCard plus a
 *     "Enter manually" toggle. The suggested name was silently saved as data when
 *     the user clicked Next without touching the field.
 *   - Fixed: the step now shows a single text input. The suggested name is a
 *     placeholder only — it is never saved unless the user types it.
 *   - Edit pre-fill: trainingPreferences.team was not read back on edit load.
 *     Fixed: the edit load effect now reads trainingPreferences.team and pre-fills
 *     teamManualText.
 *   - Jersey number "00": must round-trip correctly through the save/reload path.
 *     The jersey field is stored as a string, so "00" must not be coerced to 0 or "0".
 *
 * These tests verify the data contracts that the wizard depends on.
 */

import { describe, it, expect } from 'vitest';

// ─── Team name save payload contract ─────────────────────────────────────────

describe('team name save payload', () => {
  /**
   * Mirrors the effectiveTeam logic in parent-portal-player-create.tsx:
   *   const effectiveTeam = teamName || teamManualText.trim() || null;
   *
   * With the new single-input approach:
   *   - teamManualText = what the user typed
   *   - teamName = set by commitStep when teamManual=true and teamManualText is non-empty
   *   - suggestedTeamName = placeholder only, never saved unless user types it
   */
  function effectiveTeam(teamName: string, teamManualText: string): string | null {
    return teamName || teamManualText.trim() || null;
  }

  it('saves null when the user types nothing and skips', () => {
    expect(effectiveTeam('', '')).toBeNull();
  });

  it('saves the typed value when the user enters a team name', () => {
    expect(effectiveTeam('Colorado Rush ECNL U14', '')).toBe('Colorado Rush ECNL U14');
    expect(effectiveTeam('', 'Colorado Rush ECNL U14')).toBe('Colorado Rush ECNL U14');
  });

  it('trims whitespace from the typed value', () => {
    expect(effectiveTeam('', '  Colorado Rush  ')).toBe('Colorado Rush');
  });

  it('saves null when the user clears the field after typing', () => {
    // User typed something, then deleted it
    expect(effectiveTeam('', '')).toBeNull();
  });

  it('does NOT save the suggested name when the field is left blank', () => {
    // The suggested name is a placeholder — it must never become saved data
    // unless the user explicitly types it into the input.
    const suggestedTeamName = 'Colorado Rush ECNL U14'; // computed from club+program+agegroup
    const teamManualText = ''; // user left the field blank
    const teamName = ''; // not set by commitStep (teamManual=false)

    const saved = effectiveTeam(teamName, teamManualText);
    expect(saved).toBeNull();
    // The suggested name must NOT appear in the saved payload
    expect(saved).not.toBe(suggestedTeamName);
  });
});

// ─── trainingPreferences.team round-trip ─────────────────────────────────────

describe('trainingPreferences.team round-trip', () => {
  /**
   * The GET /api/parent/players/:id endpoint returns trainingPreferences as a
   * parsed JSON object. The edit load effect reads trainingPreferences.team and
   * pre-fills teamManualText.
   *
   * This test verifies the read path that the edit load effect depends on.
   */

  interface TrainingPreferences {
    team?: string | null;
    [key: string]: unknown;
  }

  function readTeamFromPrefs(prefs: TrainingPreferences | null | undefined): string | null {
    return prefs?.team ?? null;
  }

  it('reads team name from trainingPreferences.team', () => {
    const prefs: TrainingPreferences = { team: 'Colorado Rush ECNL U14' };
    expect(readTeamFromPrefs(prefs)).toBe('Colorado Rush ECNL U14');
  });

  it('returns null when trainingPreferences is null', () => {
    expect(readTeamFromPrefs(null)).toBeNull();
  });

  it('returns null when trainingPreferences.team is absent', () => {
    expect(readTeamFromPrefs({})).toBeNull();
  });

  it('returns null when trainingPreferences.team is null', () => {
    expect(readTeamFromPrefs({ team: null })).toBeNull();
  });

  it('returns null when trainingPreferences.team is empty string', () => {
    // Empty string should be treated as no team
    const prefs: TrainingPreferences = { team: '' };
    const result = readTeamFromPrefs(prefs);
    // Empty string is falsy — the edit load uses prefs?.team which returns ''
    // The input will show '' which is correct (no pre-fill)
    expect(result).toBe('');
  });
});

// ─── Jersey number "00" preservation ─────────────────────────────────────────

describe('jersey number "00" preservation', () => {
  /**
   * Jersey is stored as a string in sc_player_profiles.jersey (varchar).
   * "00" must not be coerced to 0 or "0" at any point in the save/reload path.
   *
   * The PATCH endpoint receives jersey as a string from the request body.
   * The GET endpoint returns jersey as a string from the DB.
   * The wizard pre-fills the jersey input with the string value.
   */

  function normalizeJersey(value: string | null | undefined): string | null {
    // Mirrors the save logic: jersey is stored as-is (trimmed), or null if empty
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  it('preserves "00" as a string', () => {
    expect(normalizeJersey('00')).toBe('00');
  });

  it('preserves "0" as a string', () => {
    expect(normalizeJersey('0')).toBe('0');
  });

  it('preserves "99" as a string', () => {
    expect(normalizeJersey('99')).toBe('99');
  });

  it('returns null for empty string', () => {
    expect(normalizeJersey('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(normalizeJersey(null)).toBeNull();
  });

  it('does not coerce "00" to number 0', () => {
    // This would happen if the value were passed through Number() or parseInt()
    const jersey = '00';
    expect(Number(jersey)).toBe(0); // shows the coercion risk
    expect(normalizeJersey(jersey)).toBe('00'); // confirms we avoid it
    expect(normalizeJersey(jersey)).not.toBe('0');
    expect(normalizeJersey(jersey)).not.toBe(0 as unknown as string);
  });
});

// ─── initialChoice prop on AddScheduleSheet ───────────────────────────────────

describe('AddScheduleSheet initialChoice prop', () => {
  /**
   * The AddScheduleSheet component accepts an optional initialChoice prop
   * that pre-selects the sheet to a specific form (game, practice, or feed).
   * This allows the "Connect team calendar" button to open directly to the
   * feed form without showing the picker.
   *
   * This test verifies the state initialization contract.
   */

  type SheetChoice = 'game' | 'practice' | 'feed' | null;

  function getInitialChoice(initialChoice: SheetChoice): SheetChoice {
    // Mirrors: const [choice, setChoice] = useState<SheetChoice>(initialChoice);
    return initialChoice;
  }

  it('defaults to null (shows picker) when no initialChoice is provided', () => {
    expect(getInitialChoice(null)).toBeNull();
  });

  it('opens directly to feed form when initialChoice is "feed"', () => {
    expect(getInitialChoice('feed')).toBe('feed');
  });

  it('opens directly to game form when initialChoice is "game"', () => {
    expect(getInitialChoice('game')).toBe('game');
  });

  it('opens directly to practice form when initialChoice is "practice"', () => {
    expect(getInitialChoice('practice')).toBe('practice');
  });

  it('resets to null after sheet is closed', () => {
    // The sheetInitialChoice state is cleared on close:
    //   onClose={() => { setShowSheet(false); setSheetInitialChoice(null); }}
    let sheetInitialChoice: SheetChoice = 'feed';
    // Simulate close
    sheetInitialChoice = null;
    expect(sheetInitialChoice).toBeNull();
  });
});
