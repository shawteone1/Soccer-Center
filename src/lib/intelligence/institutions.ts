import data from '@/data/intelligence/colorado-institutions.json';
/** Shared, sport-independent school records. Consumers add their own verified sport programs. */
export type Institution = typeof data.institutions[number];
export const institutions: readonly Institution[] = data.institutions;
export function getInstitution(id: string | undefined): Institution | undefined {
 return institutions.find(institution=>institution.id===id);
}
