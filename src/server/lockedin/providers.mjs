// Server-only provider boundary. No fixture or success fallback in this module.
export class ProviderUnavailable extends Error {
  constructor(provider) { super(provider + '_not_configured'); this.name = 'ProviderUnavailable'; }
}

export function readiness() {
  return {
    nsid: { status: 'blocked', reason: 'Partner API contract and sandbox access required' },
    box: { status: 'unvalidated', reason: 'OAuth setup and isolated storage account required' },
    fiserv: { status: 'blocked', reason: 'Product, merchant scope and sandbox access required' },
    club: { status: 'blocked', reason: 'Club-authorized integration required' },
  };
}

export async function startVerification() { throw new ProviderUnavailable('nsid'); }
export async function startPaymentSetup() { throw new ProviderUnavailable('fiserv'); }

/**
 * Box direct-upload transport. Caller MUST resolve parent/athlete ownership,
 * authorize disclosure, scan the file, and obtain a scoped OAuth token first.
 * Never exposed directly as an HTTP handler.
 * https://developer.box.com/reference/post-files-content/
 */
export async function uploadBoxDocument({ accessToken, folderId, bytes, fetchImpl = fetch }) {
  if (!accessToken) throw new ProviderUnavailable('box');
  if (!/^[1-9][0-9]*$/.test(folderId ?? '')) throw new Error('invalid_folder');
  if (!(bytes instanceof Uint8Array) || bytes.length === 0 || bytes.length > 10 * 1024 * 1024)
    throw new Error('invalid_file_size');
  // Opaque names avoid putting athlete names or health details into provider metadata.
  const name = crypto.randomUUID() + '.bin';
  const body = new FormData();
  body.append('attributes', JSON.stringify({ name, parent: { id: folderId } }));
  body.append('file', new Blob([bytes]), name);
  let response;
  try {
    response = await fetchImpl('https://upload.box.com/api/2.0/files/content', {
      method: 'POST', headers: { Authorization: 'Bearer ' + accessToken },
      body, redirect: 'error', signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error('box_delivery_uncertain'); }
  // Do not log provider response bodies or tokens; do not blindly retry uploads.
  if (!response.ok) throw new Error('box_upload_rejected');
  let result;
  try { result = await response.json(); } catch { throw new Error('box_delivery_uncertain'); }
  const fileId = result?.entries?.[0]?.id;
  if (typeof fileId !== 'string' || !/^[0-9]+$/.test(fileId))
    throw new Error('box_delivery_uncertain');
  return { provider: 'box', fileId };
}
