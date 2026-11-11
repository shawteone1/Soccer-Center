import {expect,it} from 'vitest';
import catalog from '@/data/recruiting/college-programs.json';
import {buildColoradoColleges} from './college-catalog';
it('uses every active Colorado catalog institution and no independent additions',()=>{
 const expected=[...new Set(catalog.filter(p=>p.active&&p.regions.split(',').includes('colorado')).map(p=>p.institution))].sort();
 expect(buildColoradoColleges().map(p=>p.name).sort()).toEqual(expected);
 expect(expected).toHaveLength(20);
 expect(catalog.filter(p=>p.active&&p.regions==='colorado')).toHaveLength(36);
});
it('does not resurrect inactive programs or omit new catalog entries without enrichment',()=>{
 const row={...catalog[0],importKey:'test-new',institution:'New catalog school',regions:'arizona,colorado'};
 const result=buildColoradoColleges([row,{...row,importKey:'inactive',institution:'Inactive',active:0}]);
 expect(result).toHaveLength(1);expect(result[0].name).toBe('New catalog school');expect(result[0].fees).toEqual([]);
 expect(result[0].reviewStatus).toBe('pending');
});
it('keeps reviewed academic facts while using catalog names and programs',()=>{
 const result=buildColoradoColleges();expect(result.find(p=>p.name==='University of Denver')?.fees.length).toBeGreaterThan(0);
 const cu=result.find(p=>p.name==='University of Colorado Boulder')!;expect(cu.programs).toHaveLength(1);expect(cu.programs[0]).toContain('Women');
});

it('preserves every inherited coach name without publishing contact fields',()=>{
 const schools=buildColoradoColleges();
 for(const school of schools)for(const coach of school.catalogCoaches??[]) {
  expect(coach.name).toBeTruthy(); expect(coach).not.toHaveProperty('email'); expect(coach).not.toHaveProperty('phone');
 }
 expect(schools.reduce((n,s)=>n+(s.catalogCoaches?.length??0),0)).toBeGreaterThan(0);
});
it('distinguishes head-role start from joining and retains unresolved roles',()=>{
 const schools=buildColoradoColleges();const uccs=schools.find(s=>s.name==='University of Colorado Colorado Springs')!;
 const wilcox=uccs.leadership.find(l=>l.name==='Lewis Wilcox')!;
 expect(wilcox.startDate).toBe('2021-12-01');expect(wilcox.joinedDate).toBe('2019');
 const trinidad=schools.find(s=>s.name==='Trinidad State College')!;expect(trinidad.leadership.every(l=>l.status==='historical')).toBe(true);
 const lamar=schools.find(s=>s.name==='Lamar Community College')!;expect(lamar.gaps?.join(' ')).toContain('Unresolved');
});

it('joins reusable institution facts without mixing soccer into the institution dataset',async()=>{
 const {default:shared}=await import('@/data/intelligence/colorado-institutions.json');
 const {default:soccer}=await import('@/data/intelligence/colorado-colleges.json');
 expect(shared.institutions).toHaveLength(20);
 for(const school of shared.institutions){expect(school).not.toHaveProperty('leadership');expect(school).not.toHaveProperty('programImportKeys');}
 for(const program of soccer.colleges){expect(program.sport).toBe('soccer');expect(program).not.toHaveProperty('academicFacts');expect(program).not.toHaveProperty('fees');expect(shared.institutions.some(i=>i.id===program.institutionId)).toBe(true);}
 const profiles=buildColoradoColleges();expect(profiles.reduce((n,p)=>n+p.fees.length,0)).toBe(19);
});
