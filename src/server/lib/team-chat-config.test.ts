import { describe, expect, it } from 'vitest';
import { safeTeamChatUrl } from '@/lib/portal/team-chat';
import { parseTeamChatConfig, visibleTeamChats } from './team-chat-config';
const channel = {id: 'storm-u16', teamLabel: 'Storm U16', provider: 'whatsapp', url: 'https://chat.whatsapp.com/abcdefghijklmnopqrstuv', members: [{userId: 'parent1', playerId: 'player1'}]};
it('only returns explicitly granted and active owned players; omits grant list', () => {
 const config = parseTeamChatConfig(JSON.stringify([channel]));
 expect(visibleTeamChats(config, 'parent1', [{id:'player1',label:'Alex'}])).toEqual([{id:channel.id,teamLabel:channel.teamLabel,provider:'whatsapp',url:channel.url,playerLabel:'Alex'}]);
 expect(visibleTeamChats(config, 'parent2', [{id:'player1',label:'Alex'}])).toEqual([]);
 expect(visibleTeamChats(config, 'parent1', [{id:'deleted-or-other',label:'Alex'}])).toEqual([]);
});
it('deduplicates a channel shared by siblings', () => {
 const c = {...channel, members:[...channel.members,{userId:'parent1',playerId:'player2'}]};
 expect(visibleTeamChats(parseTeamChatConfig(JSON.stringify([c])), 'parent1', [{id:'player1',label:'Alex'},{id:'player2',label:'Sam'}])).toHaveLength(1);
});
it('empty configuration does not create demo links', () => expect(parseTeamChatConfig(undefined)).toEqual([]));
it('malformed configuration fails closed', () => {
 for (const value of ['oops', '{}', JSON.stringify([channel,channel]), JSON.stringify([{...channel,members:[{}]}]), JSON.stringify([{...channel,provider:'other'}])]) expect(() => parseTeamChatConfig(value)).toThrow();
});
describe('provider URL validation', () => {
 it.each(['https://chat.whatsapp.com.evil.example/abcdefghijklmnopqrstuv','https://evil.example/','javascript:alert(1)','http://chat.whatsapp.com/abcdefghijklmnopqrstuv','https://user:pass@chat.whatsapp.com/abcdefghijklmnopqrstuv','https://chat.whatsapp.com/abcdefghijklmnopqrstuv?redirect=evil','https://chat.whatsapp.com:444/abcdefghijklmnopqrstuv'])('rejects %s', url => expect(safeTeamChatUrl('whatsapp',url)).toBeNull());
 it('accepts supported Slack channel paths only', () => {
  expect(safeTeamChatUrl('slack','https://app.slack.com/client/T123/C456')).toBeTruthy();
  expect(safeTeamChatUrl('slack','https://storm.slack.com/archives/C456')).toBeTruthy();
  expect(safeTeamChatUrl('slack','https://storm.slack.com/redirect?url=evil')).toBeNull();
 });
});
