import { useState } from 'react';

/** Isolated concept module. Mount within the existing authenticated parent route. */
export default function LockedInExperience() {
  const [revision, setRevision] = useState(0);
  return (
    <section aria-label="Locked In parent experience">
      <div style={{display: 'flex', gap: 16, alignItems: 'center', padding: 12}}>
        <span>Interactive concept · fictional data only</span>
        <button type="button" onClick={() => setRevision(value => value + 1)}
          style={{minHeight: 44, padding: '8px 16px'}}>Reset demo</button>
      </div>
      <iframe key={revision} src="/locked-in/index.html"
        title="Locked In — your information, your control"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        style={{display: 'block', width: '100%', height: 'calc(100dvh - 120px)',
          minHeight: 640, border: 0, background: 'hsl(var(--locked-in-bg))'}} />
    </section>
  );
}
