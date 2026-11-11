import { useState } from 'react';
import camps from '../data/recruiting/id-camps.json';
import programs from '../data/recruiting/college-programs.json';
import clubs from '../data/colorado-club-camps.json';

const regions: Record<string, string> = {
  colorado: 'Colorado', arizona: 'Arizona', california: 'California — region unspecified', 'cal-north': 'Northern California',
  'cal-south': 'Southern California', nevada: 'Nevada', oregon: 'Oregon', washington: 'Washington',
};
const normalize = (value: string) => value.replace('california-north', 'cal-north').replace('california-south', 'cal-south');
const safeUrl = (value: string) => { try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
const entries = [
  ...clubs.map(c => ({ id: `club-${c.id}`, name: c.name, type: 'club', region: c.region, gender: '', url: c.url, note: c.note, checked: c.checkedDate, camp: true })),
  ...camps.map(c => ({ id: c.importKey, name: c.institution, type: 'college', region: normalize(c.region), gender: c.gender, url: c.registrationUrl || c.sourceUrl, note: c.campName, checked: c.checkedDate, camp: true })),
  ...programs.filter(p => p.active && !camps.some(c => c.programImportKey === p.importKey)).map(p => ({ id: p.importKey, name: p.institution, type: 'college', region: normalize(p.regions), gender: p.gender, url: p.programUrl, note: 'Camp listing not yet confirmed. Check the official soccer program for camp information.', checked: p.checkedDate, camp: false })),
];

export default function PublicCampDirectory() {
  const [type, setType] = useState('club');
  const [region, setRegion] = useState('all');
  const [gender, setGender] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const rows = entries.filter(e => e.type === type && (type === 'club' || region === 'all' || e.region.split(/[,;]+/).map(s => s.trim()).includes(region)) && (type === 'club' || gender === 'all' || e.gender === gender) && `${e.name} ${e.note}`.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  const current = Math.min(page, pages - 1);
  const control = 'min-h-11 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
  return <section id="soccer-camps" aria-labelledby="camp-directory-title" className="bg-muted/30 py-12">
    <div className="mx-auto max-w-6xl px-6">
      <h2 id="camp-directory-title" className="text-3xl font-bold text-foreground">Find soccer camps</h2>
      <p className="mt-3 max-w-3xl text-muted-foreground">Explore Colorado club camps and college camp resources across our regions. Check dates, ages, costs and availability directly with the organizer before registering.</p>
      <div className="my-6 flex flex-wrap gap-3" role="group" aria-label="Camp directory type">
        { [['club', 'Colorado club camps'], ['college', 'College camps & programs']].map(([value, label]) => <button key={value} type="button" aria-pressed={type === value} onClick={() => { setType(value); setPage(0); }} className={`${control} ${type === value ? 'font-bold ring-2 ring-current' : ''}`}>{label}</button>) }
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">Search<input className={control} type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Club or college name" /></label>
        {type === 'college' && <>
          <label className="flex flex-col gap-1 text-sm">Region<select className={control} value={region} onChange={e => { setRegion(e.target.value); setPage(0); }}><option value="all">All regions</option>{Object.entries(regions).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm">Program<select className={control} value={gender} onChange={e => { setGender(e.target.value); setPage(0); }}><option value="all">All programs</option><option value="mens">Men’s soccer</option><option value="womens">Women’s soccer</option></select></label>
        </>}
      </div>
      <p className="my-4 text-sm text-muted-foreground" aria-live="polite">{rows.length} {type === 'club' ? 'club resources — initial Colorado selection' : 'camp and program resources'}. Camp dates: not confirmed.</p>
      {rows.length === 0 ? <p className="rounded-xl border border-border p-6">No matches. Try a different search or region.</p> : <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.slice(current * 6, current * 6 + 6).map(e => <li key={e.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-5 text-card-foreground">
          <p className="text-sm text-muted-foreground">{regions[e.region] || e.region}{e.gender ? ` · ${e.gender === 'mens' ? 'Men’s' : 'Women’s'} soccer` : ''}</p>
          <h3 className="mt-2 text-xl font-semibold">{e.name}</h3>
          <p className="mt-2 text-sm">{e.note}</p>
          <p className="mt-3 text-sm font-medium">{e.camp ? 'Directory resource · dates TBD' : 'Program link · camp details unconfirmed'}</p>
          <p className="mt-2 text-xs text-muted-foreground">{e.type === 'club' ? 'Source reviewed' : 'Catalog reference date'}: {e.checked}. Confirm current details with the organizer.</p>
          {safeUrl(e.url) && <a className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4" href={safeUrl(e.url)!} target="_blank" rel="noopener noreferrer">{e.camp ? 'Visit official camp resource' : 'Visit official soccer program'}<span className="sr-only"> for {e.name} (opens a new tab)</span></a>}
        </li>)}
      </ul>}
      {pages > 1 && <nav aria-label="Camp directory pages" className="mt-6 flex flex-wrap items-center gap-4"><button type="button" className={`${control} disabled:opacity-40`} disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span aria-live="polite">Page {current + 1} of {pages}</span><button type="button" className={`${control} disabled:opacity-40`} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Next</button></nav>}
    </div>
  </section>;
}
