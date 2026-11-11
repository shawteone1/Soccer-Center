import { describe, it, expect } from 'vitest';
import { coachPreviewParams, filterCoachProfile } from '../coach-sharing';
import { COACH_PROFILE_FIELDS } from '@/server/lib/coach-profile-fields.js';

describe('coach sharing consent contract', () => {
  const profile = { label: 'Player', avatarUrl: '/photo', highSchool: 'Central High', schoolCity: 'Denver', schoolState: 'CO', highlights: [{ id: 'video-1' }], upcomingEvents: [{ id: 'game-1' }], academics: { gpa: 4 }, contactEmail: 'private@example.com', gpa: '4', userId: 'private', mediaOriginProtected: true };
  it('live field catalog makes both media and games selectable', () => {
    const keys = COACH_PROFILE_FIELDS.map(f => f.key);
    expect(keys).toContain('highlights'); expect(keys).toContain('upcomingEvents');
  });
  it('preserves selected school location, media, games, academics and photo', () => {
    expect(filterCoachProfile(profile, ['highSchool', 'highlights', 'upcomingEvents', 'academics', 'photo'])).toEqual({ highSchool: 'Central High', schoolCity: 'Denver', schoolState: 'CO', highlights: [{ id: 'video-1' }], upcomingEvents: [{ id: 'game-1' }], academics: { gpa: 4 }, avatarUrl: '/photo', mediaOriginProtected: true });
  });
  it('omits deselected sections and rejects internal/unknown field names', () => {
    expect(filterCoachProfile(profile, ['label', 'gpa', 'userId', '__proto__'])).toEqual({ label: 'Player', mediaOriginProtected: true });
  });
  it('explicit empty query selections cannot become all records', () => {
    const params = coachPreviewParams([], [], [], []);
    for (const key of ['approvedFields', 'matchIds', 'selectedMedia', 'selectedEvents']) {
      expect(params.has(key)).toBe(true); expect(params.get(key)).toBe('');
    }
  });
  it('serializes all selected IDs and consent for the server preview', () => {
    const params = coachPreviewParams(['highlights','upcomingEvents'], ['m1'], ['v1','v2'], ['e1']);
    expect(Object.fromEntries(params)).toEqual({ approvedFields: 'highlights,upcomingEvents', matchIds: 'm1', selectedMedia: 'v1,v2', selectedEvents: 'e1' });
  });
});
