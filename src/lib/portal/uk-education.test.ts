import { describe, it, expect } from 'vitest';
import { emptyUkEducation, ukEducationSchema, parseUkEducation, ukChecklist } from './uk-education';
import { filterCoachProfile } from './coach-sharing';
import { buildCoachProjection, type PlayerProjectionRow } from '../../server/lib/coach-projection';

describe('UK education', () => {
  it('retains original grades and predicted status across serialization', () => {
    const p = emptyUkEducation();
    p.exams.push({ qualification: 'A level', subject: 'Biology', awardTitle: '', board: 'AQA', grade: 'A*', status: 'Predicted', examMonth: '2027-06' });
    expect(parseUkEducation(JSON.stringify(p))).toEqual(p);
    expect(ukChecklist(p).join(' ')).toContain('final results');
  });
  it('rejects unsupported qualifications and oversized or malformed records', () => {
    const exam = { qualification: 'GNVQ', subject: 'Sport', awardTitle: '', board: '', grade: '', status: 'Pending', examMonth: '' };
    expect(ukEducationSchema.safeParse({ ...emptyUkEducation(), exams: [exam] }).success).toBe(false);
    expect(ukEducationSchema.safeParse({ ...emptyUkEducation(), entryYear: 1 }).success).toBe(false);
    expect(ukEducationSchema.safeParse({ ...emptyUkEducation(), documents: { reports: 'yes' } }).success).toBe(false);
  });
  it('does not interpret an empty profile as ready or eligible', () => {
    expect(ukChecklist(emptyUkEducation()).length).toBeGreaterThan(0);
    expect(parseUkEducation(null)).toBeNull();
  });
  it('drops private checklist and stale GPA from UK projection; consent gates exams', () => {
    const player = { id: 'test', ukEducation: emptyUkEducation(), gpa: '4', gpaScale: '4' } as unknown as PlayerProjectionRow;
    const projection = buildCoachProjection({ player, affiliations: [], matchRecords: [], approvedMatchRecordIds: [], statsTableAvailable: false, mediaOriginProtected: true, highlights: [], upcomingEvents: [] });
    expect(projection.academics).toBeNull();
    expect(projection.ukEducation).not.toHaveProperty('documents');
    expect(filterCoachProfile(projection, [])).not.toHaveProperty('ukEducation');
    expect(filterCoachProfile(projection, ['academics'])).toHaveProperty('ukEducation');
    expect(filterCoachProfile(projection, ['ukEducation'])).not.toHaveProperty('ukEducation');
  });
});
