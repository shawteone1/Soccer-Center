import { beforeEach, expect, it, vi } from 'vitest';
import type {Request,Response} from 'express';
const m=vi.hoisted(()=>({auth:vi.fn(),execute:vi.fn(),write:vi.fn(),unlink:vi.fn()}));
vi.mock('@/server/auth-policy.js',()=>({requireParentAccess:m.auth,setPrivateCacheHeaders:vi.fn()}));
vi.mock('@/server/db/client.js',()=>({db:{execute:m.execute}}));
vi.mock('@/server/lib/private-uploads.js',()=>({PERSISTENT_UPLOAD_ROOT:'/private/uploads'}));
vi.mock('fs/promises',()=>({default:{mkdir:vi.fn(),writeFile:m.write,unlink:m.unlink}}));
vi.mock('multer',()=>({default:Object.assign(()=>({single:()=> (_req:unknown,_res:unknown,cb:()=>void)=>cb()}),{memoryStorage:()=>({})})}));
import handler from './POST';
function response(){const r={status:vi.fn(),json:vi.fn(),headersSent:false};r.status.mockReturnValue(r);return r;}
const request=()=>({params:{playerId:'player-1'},file:{mimetype:'image/png',buffer:Buffer.from('image')}} as unknown as Request);
beforeEach(()=>{vi.clearAllMocks();m.auth.mockResolvedValue({id:'owner-1'});m.execute.mockResolvedValue([[{id:'player-1'}]]);m.write.mockResolvedValue(undefined);m.unlink.mockResolvedValue(undefined);});
it('saves an exact private revision and returns it for reloads',async()=>{
 const r=response();await handler(request(),r as unknown as Response);
 const url=r.json.mock.calls[0][0].avatarUrl;
 const asset=new URL(url,'https://example.org').searchParams.get('asset');
 expect(asset).toMatch(/^[a-f0-9-]{36}\.png$/);
 expect(m.write.mock.calls[0][0]).toBe(`/private/uploads/player-photos/owner-1/player-1-${asset}`);
 expect(m.execute).toHaveBeenCalledTimes(2);
});
it('does not overwrite the old file when the database save fails',async()=>{
 m.execute.mockResolvedValueOnce([[{id:'player-1'}]]).mockRejectedValueOnce(new Error('DB failure'));
 const r=response();await handler(request(),r as unknown as Response);
 expect(r.status).toHaveBeenCalledWith(500);
 expect(m.unlink).toHaveBeenCalledWith(m.write.mock.calls[0][0]);
 expect(r.json.mock.calls[0][0]).not.toHaveProperty('avatarUrl');
});
it('rejects a missing or deleted player before writing',async()=>{
 m.execute.mockResolvedValueOnce([[]]);const r=response();await handler(request(),r as unknown as Response);
 expect(r.status).toHaveBeenCalledWith(404);expect(m.write).not.toHaveBeenCalled();
});
