/** Preflight only new uploads; retries and library attachments consume no new slot. */
export const MEDIA_ITEM_LIMIT = 20;
export const MEDIA_FULL_MESSAGE = 'Your library is full (20 items). Use From library to attach an existing file, or delete an unwanted library file before uploading a new one.';

export async function checkMediaUpload(file: File): Promise<void> {
  const max = file.type.startsWith('image/') ? 10 : 100;
  if (file.size > max * 1024 * 1024) throw new Error(`File too large. Maximum size is ${max} MB.`);
  let response: Response;
  try {
    response = await fetch('/api/parent/media?limit=50', { credentials: 'include', cache: 'no-store' });
  } catch {
    throw new Error('Could not check library capacity. Upload has not started. Please retry.');
  }
  if (!response.ok) throw new Error('Could not check library capacity. Upload has not started. Please retry.');
  const data = await response.json();
  const count = data.total;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) {
    throw new Error('Could not check library capacity. Upload has not started. Please retry.');
  }
  if (count >= MEDIA_ITEM_LIMIT) throw new Error(MEDIA_FULL_MESSAGE);
}
