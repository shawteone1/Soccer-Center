import { useEffect, useState } from 'react';
import { MessageCircle, ExternalLink } from 'lucide-react';
import { PpCard, PpSectionHeading, PpButton } from './PpPrimitives';
import { safeTeamChatUrl, type TeamChatLink } from '@/lib/portal/team-chat';
export default function TeamChatCard() {
  const [channels, setChannels] = useState<TeamChatLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false); setChannels([]);
    fetch('/api/parent/team-chat', {credentials: 'include', cache: 'no-store', signal: controller.signal})
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable');
        const data = await response.json();
        if (!Array.isArray(data.channels)) throw new Error('Invalid response');
        if (!controller.signal.aborted) setChannels(data.channels.filter((c: TeamChatLink) => safeTeamChatUrl(c.provider, c.url)));
      }).catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <PpCard className="mb-5">
    <div className="flex items-center gap-2 mb-2"><MessageCircle size={18}/><PpSectionHeading>Team Chat</PpSectionHeading></div>
    <p className="text-sm mb-3">Your team conversations, one tap away. Messages open in WhatsApp or Slack.</p>
    {loading ? <p role="status">Loading team chats…</p> : error ? <div role="alert">
      <p>Team chat could not be loaded.</p><PpButton variant="outline" onClick={() => setAttempt(n => n + 1)}>Retry team chat</PpButton>
    </div> : channels.length === 0 ? <p className="text-sm">Team chat hasn’t been connected yet. Ask your team administrator for access.</p> :
      <ul className="space-y-3">{channels.map(c => <li key={c.id} className="rounded-xl border border-border p-3 flex flex-wrap gap-3 items-center justify-between">
        <div className="min-w-0"><p className="font-semibold break-words">{c.teamLabel}</p><p className="text-sm break-words">{c.playerLabel}</p></div>
        <a href={c.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          className="pp-btn pp-btn-primary inline-flex items-center justify-center gap-2 min-h-11 px-4 rounded-xl font-semibold"
          aria-label={`Open ${c.provider === 'whatsapp' ? 'WhatsApp' : 'Slack'} for ${c.teamLabel} (opens externally)`}>
          Open {c.provider === 'whatsapp' ? 'WhatsApp' : 'Slack'}<ExternalLink size={16} aria-hidden="true"/>
        </a>
      </li>)}</ul>}
    <p className="text-xs mt-3">Group membership is managed by your team administrator. WhatsApp group members can see your phone number. Messages and unread counts are not synced here.</p>
  </PpCard>;
}
