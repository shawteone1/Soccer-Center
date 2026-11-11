/** Public facts only. No player data, weighting, paid placement or invented rankings. */
export interface Evidence { url: string; checkedDate: string; period: string | null; status: string; note: string }
export interface Fee { program: string; ages: string; amount: number; currency: string; unit: string; period: string; status: string; notes: string; source: Evidence }
export interface Leadership { name:string; role:string; startDate:string|null; joinedDate?:string|null; joinedContext?:string; dateBasis?:string; status?:string; note?:string; source:Evidence; programImportKey?:string }
export interface Fact {label:string; value:string; source:Evidence}
export interface Profile {
 catalogPrograms?: { importKey:string; gender:string; division:string; conference:string|null; programUrl:string; staffUrl:string }[];
 outcomes?: null; turnoverRate?: null;
 id: string; name: string; kind: string; area: string; website: string; programs: string[]; summary: string;
 sources: Evidence[]; size: {value: number; unit: string; period: string|null; status: string; note: string; source: Evidence}[];
 fees: Fee[]; leadership: Leadership[];
 history: {date: string; event: string; source: Evidence}[]; questions: string[]; reviewStatus: string;
 academicFacts?: Fact[]; facts?:Fact[]; gaps?:string[]; catalogCoaches?: {name:string; role:string; programImportKey:string; checkedDate:string; sourceUrl:string; status:string}[];
}
export function validSelection(raw: unknown, profiles: Profile[]): string[] {
 if (!Array.isArray(raw)) return [];
 const known = new Set(profiles.map(p => p.id));
 return [...new Set(raw.filter((id): id is string => typeof id === 'string' && known.has(id)))].slice(0,3);
}
export function readSelection(search: string, profiles: Profile[]): string[] {
 return validSelection(new URLSearchParams(search).get('compare')?.split(',') ?? [], profiles);
}
export function comparisonUrl(base: string, ids: string[], profiles: Profile[]): string {
 const url = new URL(base); url.search = ''; url.hash = '';
 url.searchParams.set('compare',validSelection(ids,profiles).join(','));
 return url.toString();
}
export function filterProfiles(profiles: Profile[], query: string, area: string, program: string): Profile[] {
 const q=query.trim().toLowerCase();
 return profiles.filter(p=>(!q || `${p.name} ${p.area} ${p.programs.join(' ')}`.toLowerCase().includes(q)) && (!area || p.area===area) && (!program || p.programs.includes(program)));
}
export function feeLabel(f: Fee): string {
 return `${new Intl.NumberFormat('en-US',{style:'currency',currency:f.currency,maximumFractionDigits:2}).format(f.amount)} / ${f.unit} · ${f.program} · ${f.ages} · ${f.period}${f.status==='tentative'?' · tentative':''}`;
}
export function comparableFees(a: Fee,b: Fee): boolean {
 return a.status==='observed' && b.status==='observed' && a.currency===b.currency && a.unit===b.unit && a.period===b.period && a.ages===b.ages && a.program===b.program;
}
