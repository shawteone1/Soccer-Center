import { useState } from 'react';
import { ShieldCheck, LockKeyhole, Eye, ArrowRight, CheckCircle2 } from 'lucide-react';
import '../../styles/locked-in-walkthrough.css';

type Phase = 'request' | 'pending' | 'verified' | 'shared' | 'revoked';
type Outcome = 'pending' | 'verified' | 'review';
const fields = [
  { id: 'status', label: 'Verification status', value: 'Verified — simulated', required: true },
  { id: 'reference', label: 'Verification reference', value: 'DEMO-NSID-1042', required: false },
  { id: 'age', label: 'Age-group eligibility', value: 'U15 — illustrative only', required: false },
] as const;

export default function LockedInWalkthrough() {
  const [phase, setPhase] = useState<Phase>('request');
  const [outcome, setOutcome] = useState<Outcome>('pending');
  const [consent, setConsent] = useState(false);
  const [approved, setApproved] = useState(false);
  const [selected, setSelected] = useState<string[]>(['status']);
  const [view, setView] = useState<'parent' | 'club'>('parent');
  const [history, setHistory] = useState<string[]>([]);
  const addHistory = (message: string) => setHistory(items => [...items, message]);
  const verified = outcome === 'verified';
  const shared = phase === 'shared';
  const step = phase === 'request' ? 0 : phase === 'pending' ? 1 : phase === 'verified' ? 2 : 3;
  function chooseField(id: string, checked: boolean) {
    setSelected(items => checked ? [...items, id] : items.filter(item => item !== id));
    setApproved(false);
  }
  return <section className="li-meeting" aria-labelledby="li-story-title">
    <div className="li-hero">
      <p className="li-eyebrow">Soccer Center · Locked In</p>
      <h2 id="li-story-title">One place to see what’s needed.<br />A clear choice about what’s shared.</h2>
      <p>A parent-led verification journey, connected to the player’s life beyond a single team or season.</p>
      <span className="li-demo-label">Interactive concept · fictional records · no live integration</span>
    </div>

    <div className="li-context">
      <div><strong>Jordan Taylor · sample player</strong><span>U15 · Example Colorado FC · sample season</span></div>
      <div><LockKeyhole size={18} aria-hidden="true" /><span>No identity documents, health records or payment details are entered here.</span></div>
    </div>
    <ol className="li-steps" aria-label="Verification journey">
      {['Review request', 'Verify with provider', 'Choose what to share', 'Club handoff'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <CheckCircle2 size={16} aria-hidden="true" /> : index + 1}</span>{label}</li>)}
    </ol>

    <div className="li-switch" role="group" aria-label="Walkthrough perspective">
      <button type="button" aria-pressed={view === 'parent'} onClick={() => setView('parent')}>Parent view</button>
      <button type="button" aria-pressed={view === 'club'} onClick={() => setView('club')}>Club view</button>
    </div>

    <div className="li-columns">
      <div className="li-panel">
        {view === 'parent' ? <>
          <p className="li-eyebrow">Parent view</p>
          <h3>{phase === 'request' ? 'A request, not open access' : phase === 'pending' ? 'Provider verification' : shared ? 'You control the handoff' : phase === 'revoked' ? 'Sharing revoked in this demo' : 'Review exactly what the club receives'}</h3>
          {phase === 'request' && <>
            <p>Example Colorado FC requests an age-verification status for Jordan’s registration. This sample request does not give the club access to the parent’s documents.</p>
            <dl className="li-facts"><div><dt>Requested by</dt><dd>Example Colorado FC · registrar</dd></div><div><dt>Purpose</dt><dd>Player registration eligibility</dd></div><div><dt>Proposed provider</dt><dd>National Sports ID · integration to discuss</dd></div></dl>
            <label className="li-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><span>I understand this is a simulated provider handoff. Nothing is sent to NSID or the club.</span></label>
            <button type="button" className="li-primary" disabled={!consent} onClick={() => { setPhase('pending'); addHistory('Parent started a simulated verification request.'); }}>Start simulated verification <ArrowRight size={16} aria-hidden="true" /></button>
          </>}
          {phase === 'pending' && <>
            <p>The proposed experience would direct the parent into the provider’s verification flow, then return a limited status to Soccer Center. The API, required fields and provider-hosted experience are discovery questions for NSID.</p>
            <div className="li-status" role="status">{outcome === 'review' ? 'Simulated: more information required. No verified status is available to share.' : 'Simulated: awaiting a provider response.'}</div>
            <div className="li-actions"><button type="button" onClick={() => { setOutcome('review'); addHistory('Simulated provider response: more information required.'); }}>Simulate needs review</button><button type="button" className="li-primary" onClick={() => { setOutcome('verified'); setPhase('verified'); addHistory('Simulated provider response: verified.'); }}>Simulate verified response</button></div>
            <p className="li-small">These controls change the demo only. They do not verify anyone’s identity or eligibility.</p>
          </>}
          {verified && !shared && phase !== 'revoked' && <>
            <p>Recipient: <strong>Example Colorado FC registrar</strong>. Purpose: player registration. Choose the sample status fields to include.</p>
            <fieldset className="li-fieldset"><legend>Information in this handoff</legend>{fields.map(field => <label className="li-check" key={field.id}><input type="checkbox" checked={selected.includes(field.id)} disabled={field.required} onChange={e => chooseField(field.id, e.target.checked)} /><span>{field.label}{field.required ? ' (required for this status handoff)' : ' (optional)'}</span></label>)}</fieldset>
            <div className="li-status"><strong>Preview</strong><p>Sample player: Jordan Taylor · DEMO-PLAYER-0001</p><dl className="li-facts">{fields.filter(f => selected.includes(f.id)).map(f => <div key={f.id}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl></div>
            <p className="li-small">Excluded: birth certificate, date of birth, health records, payment credentials and other player-profile content. This is a proposed minimum-data model, not a confirmed NSID response format.</p>
            <label className="li-check"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /><span>I approve sharing only this sample summary with the named club for this purpose.</span></label>
            <button type="button" className="li-primary" disabled={!approved} onClick={() => { setPhase('shared'); setView('club'); addHistory('Parent approved the selected summary; simulated club access opened.'); }}>Simulate sharing with club</button>
          </>}
          {shared && <><div className="li-status" role="status">Selected summary shared — simulated only.</div><p>The club view now shows only the selected fields. The activity below stays in this browser session and is not a production audit log.</p><button type="button" onClick={() => { setPhase('revoked'); addHistory('Parent revoked simulated club access.'); }}>Revoke demo access</button><p className="li-small">A future service would need to enforce revocation on every request. Revoking access cannot recall information a recipient already copied.</p></>}
          {phase === 'revoked' && <><p>The club summary is no longer available in this demo. The simulated verification status remains with the parent.</p><button type="button" onClick={() => { setApproved(false); setPhase('verified'); }}>Review a new handoff</button></>}
        </> : <>
          <p className="li-eyebrow">Club view · fictional recipient</p><h3>Example Colorado FC registrar</h3>
          {shared ? <><div className="li-status" role="status">Parent-approved summary · simulated</div><p>Sample player reference: Jordan Taylor · DEMO-PLAYER-0001</p><dl className="li-facts">{fields.filter(f => selected.includes(f.id)).map(f => <div key={f.id}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl><p>Next step: registrar checks club-specific requirements and completes the club’s own acceptance process.</p><p className="li-small">No registration was accepted and nothing was sent to club software. Missing club requirements are not marked complete by this demo.</p></> : <div className="li-status" role="status">{phase === 'revoked' ? 'Access revoked — sample summary unavailable.' : 'No parent-approved summary available. Verification alone does not grant club access.'}</div>}
          <button type="button" onClick={() => setView('parent')}>Return to parent controls</button>
        </>}
      </div>
      <aside className="li-panel li-side" aria-label="Consolidated registration view">
        <ShieldCheck size={26} aria-hidden="true" /><h3>One view. Separate responsibilities.</h3>
        <dl className="li-facts"><div><dt>Verification</dt><dd>{verified ? 'Verified — simulated' : outcome === 'review' ? 'Needs review — simulated' : phase === 'request' ? 'Not started' : 'Pending — simulated'}</dd></div><div><dt>Club access</dt><dd>{shared ? 'Selected summary only — simulated' : phase === 'revoked' ? 'Revoked — simulated' : 'Not shared'}</dd></div><div><dt>Club-specific forms</dt><dd>Not reviewed in this walkthrough</dd></div><div><dt>Payment / registration</dt><dd>Not connected</dd></div></dl>
        <p>The goal: families see their requirements and progress in one place, while each organization receives only the information needed for its role.</p>
        <p className="li-small">Consolidated visibility does not mean every organization gets access to everything. Storage, retention, permissions and security controls require implementation and validation before live use.</p>
      </aside>
    </div>
    <details className="li-panel li-detail"><summary><Eye size={18} aria-hidden="true" /> Demo activity</summary>{history.length ? <ol>{history.map((item, i) => <li key={i}>{item}</li>)}</ol> : <p>No actions yet. Use the parent view to begin.</p>}<p className="li-small">Synthetic, session-only history. Reset or reload clears it.</p></details>
    <details className="li-panel li-detail"><summary>What we want to explore with NSID</summary><ul><li>Hosted or embedded verification, licensing and sandbox access.</li><li>Minimum status fields, signed callbacks, reference IDs, expiry and re-verification.</li><li>Parent consent, authorized recipients, retention and responsibility for source documents.</li><li>Club acceptance, access revocation and a small jointly agreed pilot.</li></ul><p className="li-small">No partnership, API availability or security certification is implied.</p></details>
  </section>;
}
