import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
const mocks=vi.hoisted(() => ({ auth:vi.fn(), insert:vi.fn(), values:vi.fn(), upsert:vi.fn(), write:vi.fn(), mkdir:vi.fn() }));
vi.mock('@/server/auth-policy.js',()=>({requireParentAccess:mocks.auth,setPrivateCacheHeaders:vi.fn()}));
vi.mock('@/server/db/client.js',()=>({db:{insert:mocks.insert}}));
vi.mock('fs/promises',()=>({default:{mkdir:mocks.mkdir,writeFile:mocks.write}}));
vi.mock('multer',()=>({default:Object.assign(()=>({single:()=> (_req:unknown,_res:unknown,cb:(err?:Error)=>void)=>cb()}),{memoryStorage:()=>({})})}));
import handler from './POST';
function response(){const res={status:vi.fn(),json:vi.fn(),setHeader:vi.fn()};res.status.mockReturnValue(res);return res;}
beforeEach(()=>{vi.clearAllMocks(); mocks.auth.mockResolvedValue({id:'parent-1'});mocks.insert.mockReturnValue({values:mocks.values});mocks.values.mockReturnValue({onDuplicateKeyUpdate:mocks.upsert});mocks.upsert.mockResolvedValue({});mocks.write.mockResolvedValue(undefined);});
describe('cover upload persistence',()=>{
 it('upserts a parent-only account and returns a URL matching the written asset',async()=>{
  const res=response();await handler({file:{mimetype:'image/png',buffer:Buffer.from('image')}} as Request,res as unknown as Response);
  await vi.waitFor(()=>expect(res.json).toHaveBeenCalled());
  const url=res.json.mock.calls[0][0].publicUrl;
  const written=mocks.write.mock.calls[0][0];
  expect(written).toBe('/shared-storage/public/assets/uploads/'+url.replace('/airo-assets/uploads/',''));
  expect(mocks.values).toHaveBeenCalledWith({userId:'parent-1',coverImageUrl:url});
  expect(mocks.upsert).toHaveBeenCalledWith({set:{coverImageUrl:url}});
 });
 it('reports a failed database save instead of success',async()=>{
  mocks.upsert.mockRejectedValueOnce(new Error('DB unavailable'));
  const res=response();await handler({file:{mimetype:'image/png',buffer:Buffer.from('image')}} as Request,res as unknown as Response);
  await vi.waitFor(()=>expect(res.status).toHaveBeenCalledWith(500));
  expect(res.json.mock.calls[0][0]).not.toHaveProperty('publicUrl');
 });
 it('does not write files for an unauthenticated request',async()=>{
  mocks.auth.mockResolvedValueOnce(null);
  const res=response();await handler({} as Request,res as unknown as Response);
  expect(mocks.write).not.toHaveBeenCalled();
 });
});
