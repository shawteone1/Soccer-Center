import {it,expect,vi,beforeEach} from 'vitest';
import type {Request,Response} from 'express';
const mocks=vi.hoisted(()=>({allowed:true,owned:true,values:vi.fn(),set:vi.fn(),execute:vi.fn()}));
vi.mock('@/server/auth-policy.js',()=>({requireParentAccess:vi.fn(async(_r:Request,s:Response)=>{if(!mocks.allowed){s.status(401).json({});return null;}return{id:'owner'};}),setPrivateCacheHeaders:vi.fn()}));
vi.mock('@/server/db/client.js', () => ({
 db: {
  execute: mocks.execute,
  insert: () => ({values: mocks.values}),
  select: () => ({from: () => ({where: () => ({limit: async () => [{id:'event'}]})})}),
  update: () => ({set: (v: unknown) => {mocks.set(v);return {where: async () => []};}}),
 }
}));
import post from './POST';
import put from './[eventId]/PUT';
function res(){const r={statusCode:200,body:undefined as unknown,status(n:number){r.statusCode=n;return r;},json(v:unknown){r.body=v;return r;}};return r;}
const body={title:'Camp',startAt:'2026-12-01T17:00:00Z',playerId:'p',eventType:'camp'};
beforeEach(()=>{vi.clearAllMocks();mocks.allowed=true;mocks.owned=true;mocks.execute.mockImplementation(async()=>[mocks.owned?[{id:'p'}]:[]]);});
it.each(['camp','tournament','showcase'])('creates and edits %s without losing its type',async eventType=>{
 const req={body:{...body,eventType},params:{eventId:'event'}} as unknown as Request;const r=res();await post(req,r as unknown as Response);expect(r.statusCode).toBe(201);expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({eventType,playerId:'p',userId:'owner'}));await put(req,res() as unknown as Response);expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({eventType}));
});
it.each([post,put])('rejects another player before writing',async handler=>{mocks.owned=false;const r=res();await handler({body,params:{eventId:'event'}} as unknown as Request,r as unknown as Response);expect(r.statusCode).toBe(404);expect(mocks.values).not.toHaveBeenCalled();expect(mocks.set).not.toHaveBeenCalled();});
it('requires a session',async()=>{mocks.allowed=false;const r=res();await post({body} as unknown as Request,r as unknown as Response);expect(r.statusCode).toBe(401);expect(mocks.values).not.toHaveBeenCalled();});
