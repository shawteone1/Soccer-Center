import { safeTeamChatUrl, type ChatProvider, type TeamChatLink } from '@/lib/portal/team-chat';
interface Grant { userId: string; playerId: string }
interface Channel { id: string; teamLabel: string; provider: ChatProvider; url: string; members: Grant[] }
const string = (v: unknown, max = 128): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
/** Operator-managed private environment config. No self-reported club/team grants. */
export function parseTeamChatConfig(raw: string | undefined): Channel[] {
  if (!raw?.trim()) return [];
  if (raw.length > 200_000) throw new Error('Invalid team chat configuration');
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 100) throw new Error('Invalid team chat configuration');
  const ids = new Set<string>();
  return value.map((c: any) => {
    if (!c || !string(c.id) || ids.has(c.id) || !string(c.teamLabel) ||
      !['whatsapp', 'slack'].includes(c.provider) || !Array.isArray(c.members) || c.members.length > 1000 ||
      !c.members.every((m: any) => m && string(m.userId) && string(m.playerId))) throw new Error('Invalid team chat configuration');
    const url = safeTeamChatUrl(c.provider, c.url);
    if (!url) throw new Error('Invalid team chat configuration');
    ids.add(c.id);
    return { id: c.id, teamLabel: c.teamLabel, provider: c.provider, url, members: c.members };
  });
}
export function visibleTeamChats(channels: Channel[], userId: string, players: {id: string; label: string | null}[]): TeamChatLink[] {
  return channels.flatMap(c => {
    const labels = players.filter(p => c.members.some(m => m.userId === userId && m.playerId === p.id)).map(p => p.label || 'Player');
    return labels.length ? [{id: c.id, teamLabel: c.teamLabel, provider: c.provider, url: c.url, playerLabel: labels.join(', ')}] : [];
  });
}
