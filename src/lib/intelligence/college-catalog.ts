import catalog from '@/data/recruiting/college-programs.json';
import enrichment from '@/data/intelligence/colorado-colleges.json';
import {getInstitution} from './institutions';
import type { Profile } from './comparison';
/** Same active/region membership as the established directory. Never infer membership from research. */
export function buildColoradoColleges(rows: typeof catalog = catalog): Profile[] {
 const groups = new Map<string, typeof catalog>();
 for (const p of rows) {
  if (!p.active || !p.regions.split(',').map(v=>v.trim()).includes('colorado')) continue;
  groups.set(p.institution,[...(groups.get(p.institution)??[]),p]);
 }
 return [...groups.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,programs])=>{
  const extra=enrichment.colleges.find(e=>programs.some(p=>e.programImportKeys.includes(p.importKey)));
  const institution=getInstitution(extra?.institutionId);
  return {
   outcomes:null,turnoverRate:null,
   catalogPrograms:programs.map(({importKey,gender,division,conference,programUrl,staffUrl})=>({importKey,gender,division,conference,programUrl,staffUrl})),
   id:extra?.id??`college-${programs[0].importKey}`,kind:'college',name,area:programs[0].city,
   website:programs[0].programUrl,
   programs:programs.map(p=>`${p.gender==='womens'?'Women':'Men'} — ${p.division} · ${p.conference} (existing catalog)`),
   summary:extra?.summary??'Existing Colorado directory school. Academic enrichment is pending.',
   sources:[...(institution?.sources??[]),...(extra?.sources??[])],size:extra?.size??[],fees:institution?.costs??[],leadership:extra?.leadership??[],
   history:extra?.history??[],questions:extra?.questions??['Confirm academic fit, current program details and net price directly with the school.'],
   reviewStatus:extra?.reviewStatus??'pending',academicFacts:institution?.academicFacts??[],
   facts:extra?.facts??[],gaps:extra?.gaps??[],catalogCoaches:extra?.catalogCoaches??[],
  };
 });
}
export const coloradoCollegeProfiles=buildColoradoColleges();
