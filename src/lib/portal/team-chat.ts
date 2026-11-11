/** Only approved provider destinations; invite tokens never belong in public source. */
export type ChatProvider = 'whatsapp' | 'slack';
export interface TeamChatLink { id: string; teamLabel: string; playerLabel: string; provider: ChatProvider; url: string }
export function safeTeamChatUrl(provider: ChatProvider, raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
    if (provider === 'whatsapp' && u.hostname === 'chat.whatsapp.com' && /^\/[A-Za-z0-9_-]{16,128}\/?$/.test(u.pathname) && !u.search) return u.href;
    if (provider === 'slack' && !u.search && (
      (u.hostname === 'app.slack.com' && /^\/client\/T[A-Z0-9]+\/[CG][A-Z0-9]+\/?$/.test(u.pathname)) ||
      (/^[a-z0-9-]+\.slack\.com$/.test(u.hostname) && /^\/archives\/[CG][A-Z0-9]+\/?$/.test(u.pathname))
    )) return u.href;
  } catch { /* Invalid URL. */ }
  return null;
}
