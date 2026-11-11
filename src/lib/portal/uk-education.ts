import { z } from 'zod';

// Original grades only. No GPA conversion or eligibility certification.
export const qualifications = ['GCSE', 'IGCSE', 'AS level', 'A level', 'BTEC', 'T Level', 'National 5', 'Higher', 'Advanced Higher'] as const;
const text = z.string().trim().max(160);
export const ukEducationSchema = z.object({
  system: z.enum(['England', 'Wales', 'Northern Ireland', 'Scotland']),
  completionYear: z.number().int().min(2020).max(2050).nullable(),
  entryYear: z.number().int().min(2020).max(2050).nullable(),
  exams: z.array(z.object({
    qualification: z.enum(qualifications), subject: text.min(1),
    awardTitle: text, board: text, grade: z.string().trim().max(32),
    status: z.enum(['Predicted', 'Achieved', 'Pending', 'Resit']),
    examMonth: z.string().regex(/^$|^20\d{2}-(0[1-9]|1[0-2])$/),
  }).strict()).max(40),
  documents: z.object({ reports: z.boolean(), results: z.boolean(), completion: z.boolean() }).strict(),
}).strict();
export type UkEducation = z.infer<typeof ukEducationSchema>;
export const emptyUkEducation = (): UkEducation => ({ system: 'England', completionYear: null, entryYear: null, exams: [], documents: { reports: false, results: false, completion: false } });
export function parseUkEducation(value: unknown): UkEducation | null {
  if (value == null) return null;
  const parsed = ukEducationSchema.safeParse(typeof value === 'string' ? JSON.parse(value) : value);
  if (!parsed.success) throw new Error('Invalid stored UK education');
  return parsed.data;
}
export function ukChecklist(p: UkEducation): string[] {
  const items: string[] = [];
  if (!p.exams.length) items.push('Add your subjects and qualifications.');
  if (!p.completionYear || !p.entryYear) items.push('Add school completion and intended US entry years.');
  if (p.exams.some(e => !e.board || !e.examMonth || (e.status !== 'Pending' && !e.grade))) items.push('Complete exam boards, exam dates and available grades.');
  if (p.exams.some(e => e.status !== 'Achieved')) items.push('Replace predicted, pending and resit entries with final results when issued.');
  if (p.exams.some(e => ['BTEC', 'T Level'].includes(e.qualification))) items.push('Confirm the exact vocational award, level and subject requirements with the college and eligibility body.');
  if (!p.documents.reports) items.push('Gather school reports and academic history for the applicable official checklist.');
  if (!p.documents.results) items.push('Gather official exam result statements or certificates.');
  if (!p.documents.completion) items.push('Arrange acceptable proof of school completion when available.');
  return items;
}
export const ukSources = [
  ['NCAA international requirements', 'https://www.ncaa.org/eligibility-center/initial-eligibility-requirements/international-student-athletes/'],
  ['NAIA international pathway', 'https://www.naia.org/student-athletes/prospective/international-students/'],
  ['UK qualification levels', 'https://www.gov.uk/what-different-qualification-levels-mean/list-of-qualification-levels'],
] as const;
