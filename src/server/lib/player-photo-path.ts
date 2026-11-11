import { resolveUploadPath } from './private-uploads.js';

export function playerPhotoPath(avatarUrl: string, userId: string, playerId: string): string | null {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId) || !/^[a-zA-Z0-9_-]+$/.test(playerId)) return null;
  const prefix = `/api/parent/uploads/player-photo/${playerId}`;
  if (avatarUrl.split('?')[0] === prefix) {
    const asset = new URL(avatarUrl, 'https://soccercenter.org').searchParams.get('asset');
    if (asset !== null) {
      if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(asset)) return null;
      const relative = `player-photos/${userId}/${playerId}-${asset}`;
      return resolveUploadPath(relative).found ? relative : null;
    }
    for (const ext of ['.jpg', '.jpeg', '.png', '.webp', '.gif']) {
      const relative = `player-photos/${userId}/${playerId}${ext}`;
      if (resolveUploadPath(relative).found) return relative;
    }
  }
  const legacy = `/airo-assets/uploads/player-photos/${userId}/${playerId}`;
  if (avatarUrl.startsWith(legacy) && /^\.(jpg|jpeg|png|webp|gif)$/.test(avatarUrl.slice(legacy.length).split('?')[0])) {
    return avatarUrl.split('?')[0].replace('/airo-assets/uploads/', '');
  }
  return null;
}
