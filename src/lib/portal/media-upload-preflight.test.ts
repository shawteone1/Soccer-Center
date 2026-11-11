import { afterEach, expect, it, vi } from 'vitest';
import { checkMediaUpload, MEDIA_FULL_MESSAGE } from './media-upload-preflight';
afterEach(() => vi.unstubAllGlobals());
const file = new File(['video'], 'goal.mov', { type: 'video/quicktime' });
it('blocks a full library before any multipart upload', async () => {
 const fetcher=vi.fn(async(_url: string)=>({ok:true,json:async()=>({total:20})})); vi.stubGlobal('fetch',fetcher);
 await expect(checkMediaUpload(file)).rejects.toThrow(MEDIA_FULL_MESSAGE);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(fetcher.mock.calls[0][0]).toBe('/api/parent/media?limit=50');
});
it('allows a new file when capacity is available', async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({total:19})})));
 await expect(checkMediaUpload(file)).resolves.toBeUndefined();
});
it('fails closed when the capacity request fails', async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new TypeError('network');}));
 await expect(checkMediaUpload(file)).rejects.toThrow('Upload has not started');
});
it('does not treat an incomplete response as an empty library', async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({})})));
 await expect(checkMediaUpload(file)).rejects.toThrow('Upload has not started');
});
it('rejects an oversized video before making a request', async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const large={type:'video/quicktime',size:101*1024*1024} as File;
 await expect(checkMediaUpload(large)).rejects.toThrow('100 MB');expect(fetcher).not.toHaveBeenCalled();
});
