/**
 * step6-fields-fetch.test.tsx
 *
 * Regression tests for the coach-fields fetch path in CoachShareTab.
 *
 * WHAT IS TESTED
 * ──────────────
 *  1. 200 OK with a valid fields array → fields render, recommended ones
 *     pre-selected, Next button enabled, no error banner.
 *  2. 200 OK with an empty fields array → fieldsLoadError set, Retry shown,
 *     Next disabled.
 *  3. 403 with body { error: 'FEATURE_DISABLED' } → DEMO_FIELDS shown,
 *     featureDisabled banner, Next blocked.
 *  4. 403 with a different body (e.g. PLAYER_NOT_OWNED) → access-denied error
 *     banner, Retry shown, Next disabled. No demo fields substituted.
 *  5. 401 Unauthorized → session-expired message, Retry shown, Next disabled.
 *  6. 500 Server Error → HTTP 500 message, Retry shown, Next disabled.
 *  7. Network error on the fields fetch → network message, Retry shown.
 *  8. Retry clears the error and shows fields on success.
 *  9. Selecting a field enables Next; deselecting all disables it again.
 * 10. Advancing past fields opens the Match records step.
 * 11. Optional endpoint (match-records) network failure does NOT prevent
 *     fields from rendering or Next from being enabled.
 * 12. Optional endpoint (coach-links) 500 does NOT prevent fields from
 *     rendering or Next from being enabled.
 * 13. All optional endpoints failing simultaneously still leaves fields
 *     rendered and Next enabled.
 *
 * ISOLATION
 * ─────────
 * fetch() is mocked per-test. The component is rendered with isDemoMode=false
 * and a stable playerId. Optional endpoints return empty-but-valid responses
 * by default; individual tests override specific ones to fail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { COACH_PROFILE_FIELDS } from '@/server/lib/coach-profile-fields.js';
import CoachShareTab from '../../../../../../components/portal/CoachShareTab';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLAYER_ID = 'test-player-abc';

const REAL_FIELDS = [
  { key: 'label',           label: 'Player name',     description: 'First and last name',          recommended: true,  group: 'identity'  },
  { key: 'ageBand',         label: 'Age group',        description: 'Age band (e.g. U17)',           recommended: true,  group: 'identity'  },
  { key: 'primaryPosition', label: 'Primary position', description: 'Main playing position',         recommended: true,  group: 'positions' },
  { key: 'clubName',        label: 'Club name',        description: 'Current club',                  recommended: false, group: 'club'      },
  { key: 'stats',           label: 'Match statistics', description: 'Aggregated stats from matches', recommended: false, group: 'stats'     },
];

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Default happy-path responses for optional endpoints */
const OPTIONAL_DEFAULTS: Record<string, () => Response> = {
  'match-records':     () => jsonRes({ tableAvailable: false, records: [] }),
  'coach-links':       () => jsonRes({ links: [] }),
  'media-assignments': () => jsonRes({ assignments: [] }),
  'coach-preview':     () => jsonRes({ profile: {} }),
};

type OptionalOverrides = Partial<Record<keyof typeof OPTIONAL_DEFAULTS, () => Response | Promise<never>>>;

/**
 * Build a fetch mock.
 * - `fieldsFactory` controls what the coach-fields endpoint returns.
 * - `optionalOverrides` lets individual tests break specific optional endpoints.
 */
function makeFetch(
  fieldsFactory: () => Response | Promise<never>,
  optionalOverrides: OptionalOverrides = {},
): typeof fetch {
  return vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/coach-fields')) return Promise.resolve(fieldsFactory() as Response);
    for (const [key, factory] of Object.entries({ ...OPTIONAL_DEFAULTS, ...optionalOverrides })) {
      if (url.includes(`/${key}`) && factory) {
        const result = factory();
        return result instanceof Promise ? result : Promise.resolve(result);
      }
    }
    return Promise.resolve(new Response('{}', { status: 404 }));
  }) as unknown as typeof fetch;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CoachShareTab — coach-fields fetch', () => {

  it('1. renders field choices and enables Next on a valid 200 response', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ fields: REAL_FIELDS })));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText('Player name')).toBeInTheDocument();
      expect(screen.getByText('Age group')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /next: match records/i })).not.toBeDisabled();
    expect(screen.queryByText(/could not load/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/session has expired/i)).not.toBeInTheDocument();
  });

  it('2. shows error and Retry when server returns an empty fields array', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ fields: [] })));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/empty field list/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).toBeDisabled();
  });

  it('3. shows DEMO_FIELDS and featureDisabled banner on 403 FEATURE_DISABLED', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ error: 'FEATURE_DISABLED' }, 403)));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/coach sharing is not yet enabled/i)).toBeInTheDocument();
    });
    // DEMO_FIELDS are shown (check a known label)
    expect(screen.getByText('Player name')).toBeInTheDocument();
    // Next is blocked even though fields are visible
    expect(screen.getByRole('button', { name: /next: match records/i })).toBeDisabled();
  });

  it('4. shows access-denied error (not demo fields) on 403 with unknown error code', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ error: 'PLAYER_NOT_OWNED' }, 403)));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    // Must NOT fall back to demo fields
    expect(screen.queryByText(/coach sharing is not yet enabled/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).toBeDisabled();
  });

  it('5. shows session-expired message and Retry on 401', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({}, 401)));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).toBeDisabled();
  });

  it('6. shows HTTP 500 message and Retry on server error', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ error: 'Internal Server Error' }, 500)));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).toBeDisabled();
  });

  it('7. shows network error message and Retry when the fields fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network failure'))));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('8. Retry clears the error and shows fields on success', async () => {
    let callCount = 0;
    vi.stubGlobal('fetch', makeFetch(() => {
      callCount += 1;
      return callCount === 1 ? jsonRes({}, 500) : jsonRes({ fields: REAL_FIELDS });
    }));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(screen.queryByText(/HTTP 500/i)).not.toBeInTheDocument();
      expect(screen.getByText('Player name')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /next: match records/i })).not.toBeDisabled();
  });

  it('9. selecting a field enables Next; deselecting all disables it', async () => {
    const singleField = [
      { key: 'clubName', label: 'Club name', description: 'Current club', recommended: false, group: 'club' },
    ];
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ fields: singleField })));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText('Club name')).toBeInTheDocument());

    const nextBtn = screen.getByRole('button', { name: /next: match records/i });
    expect(nextBtn).toBeDisabled();

    fireEvent.click(screen.getByText('Club name').closest('button')!);
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(screen.getByText('Club name').closest('button')!);
    expect(nextBtn).toBeDisabled();
  });

  it('10. advancing past fields opens the Match records step', async () => {
    vi.stubGlobal('fetch', makeFetch(() => jsonRes({ fields: REAL_FIELDS })));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText('Player name')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /next: match records/i }));

    await waitFor(() => {
      expect(screen.getByText('Select match records')).toBeInTheDocument();
    });
  });

  it('11. match-records network failure does NOT prevent fields from rendering', async () => {
    vi.stubGlobal('fetch', makeFetch(
      () => jsonRes({ fields: REAL_FIELDS }),
      { 'match-records': () => Promise.reject(new Error('network')) as Promise<never> },
    ));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText('Player name')).toBeInTheDocument());

    // Fields rendered, no fields-level error
    expect(screen.queryByText(/network error loading profile fields/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).not.toBeDisabled();
  });

  it('12. coach-links 500 does NOT prevent fields from rendering', async () => {
    vi.stubGlobal('fetch', makeFetch(
      () => jsonRes({ fields: REAL_FIELDS }),
      { 'coach-links': () => jsonRes({ error: 'server error' }, 500) },
    ));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText('Player name')).toBeInTheDocument());

    expect(screen.queryByText(/could not load profile fields/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).not.toBeDisabled();
  });

  it('13. all optional endpoints failing still leaves fields rendered and Next enabled', async () => {
    const fail = () => Promise.reject(new Error('network')) as Promise<never>;
    vi.stubGlobal('fetch', makeFetch(
      () => jsonRes({ fields: REAL_FIELDS }),
      {
        'match-records':     fail,
        'coach-links':       fail,
        'media-assignments': fail,
        'coach-preview':     fail,
      },
    ));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);

    await waitFor(() => expect(screen.getByText('Player name')).toBeInTheDocument());

    expect(screen.queryByText(/network error loading profile fields/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: match records/i })).not.toBeDisabled();
  });

});


describe('live media to coach-card flow', () => {
  it('carries explicitly selected video and game through preview and link creation', async () => {
    const profile = {
      label: 'Test Player', highSchool: 'Central High', schoolCity: 'Denver', schoolState: 'CO',
      highlights: [{ id: 'video-1', title: 'Winning save', publicUrl: '/private-preview/video-1' }],
      upcomingEvents: [{ id: 'game-1', title: 'Saturday match', date: '2027-01-02', location: 'Main field' }],
    };
    let previewQuery: URLSearchParams | undefined;
    let linkBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), 'https://example.com');
      if (url.pathname.endsWith('/coach-fields')) return jsonRes({ fields: COACH_PROFILE_FIELDS });
      if (url.pathname.endsWith('/match-records')) return jsonRes({ tableAvailable: true, records: [] });
      if (url.pathname.endsWith('/media-assignments')) return jsonRes({ assignments: [{ id: 'video-1', mediaType: 'video', title: 'Winning save', kind: 'photo' }] });
      if (url.pathname.endsWith('/coach-preview')) {
        if (url.search) previewQuery = url.searchParams;
        return jsonRes({ profile });
      }
      if (url.pathname.endsWith('/coach-links') && init?.method === 'POST') {
        linkBody = JSON.parse(String(init.body));
        return jsonRes({ shareUrl: 'https://example.com/coach/profile/test-token', id: 'link-1' });
      }
      return jsonRes({ links: [] });
    }));
    render(<CoachShareTab playerId={PLAYER_ID} isDemoMode={false} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next: Match records' })).toBeEnabled());
    fireEvent.click(screen.getByRole('checkbox', { name: /High school/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Match records' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Winning save/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Upcoming events' }));
    fireEvent.click(screen.getByRole('button', { name: /Saturday match/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Next: Link settings' }));
    fireEvent.click(screen.getByTestId('preview-card-btn'));
    await waitFor(() => expect(screen.getByText('Central High')).toBeInTheDocument());
    expect(screen.getByText('Winning save')).toBeInTheDocument();
    expect(screen.getByText('Saturday match')).toBeInTheDocument();
    expect(previewQuery?.get('selectedMedia')).toBe('video-1');
    expect(previewQuery?.get('selectedEvents')).toBe('game-1');
    expect(previewQuery?.get('approvedFields')).toContain('highlights');
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(linkBody).toBeDefined());
    expect(linkBody?.selectedMedia).toEqual(['video-1']);
    expect(linkBody?.selectedEvents).toEqual(['game-1']);
    expect(linkBody?.approvedFields).toEqual(expect.arrayContaining(['highlights', 'upcomingEvents', 'highSchool']));
  });
});
