// Media-slot URL selectors, shared by this export media plugin (which serves them) and the agent's
// media-image tools (which must resolve them identically). Hand-authored .js + .d.ts, like
// media-redirect-policy, so it ships INSIDE the export archive beside media-assets-plugin.ts — its
// `./media-slot-selection.js` import must resolve within the exported project — and is importable
// by the agent runtime, with no build step and no vite dependency.

/**
 * Split a media-slot pathname into its manifest key and surface variant. A trailing `/light` or
 * `/dark` segment is a surface variant of the slot above it, not a slot of its own.
 * @param {string} pathname
 * @param {string} prefix
 * @returns {{ slotPath: string; surfaceVariant: 'light' | 'dark' | null } | null}
 */
export function parseSlotPath(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const slotPath = pathname.slice(prefix.length);
  if (!slotPath) return null;

  if (slotPath.endsWith('/light')) {
    return { slotPath: slotPath.slice(0, -'/light'.length), surfaceVariant: 'light' };
  }
  if (slotPath.endsWith('/dark')) {
    return { slotPath: slotPath.slice(0, -'/dark'.length), surfaceVariant: 'dark' };
  }

  return { slotPath, surfaceVariant: null };
}

/**
 * The image URL a slot serves for a given surface variant and `?src=` selector: the surface
 * variant's URL when set (else `currentUrl`), overridden by `srcParam` when it names the slot's
 * current image or one of its alternatives. Mirrors the preview media route exactly.
 * @param {{ currentUrl?: string; lightSurfaceUrl?: string; darkSurfaceUrl?: string; alternatives?: string[] }} slot
 * @param {'light' | 'dark' | null} surfaceVariant
 * @param {string | null} srcParam
 * @returns {string}
 */
export function resolveSlotTargetUrl(slot, surfaceVariant, srcParam) {
  let targetUrl = slot.currentUrl ?? '';
  if (surfaceVariant === 'light' && slot.lightSurfaceUrl) {
    targetUrl = slot.lightSurfaceUrl;
  } else if (surfaceVariant === 'dark' && slot.darkSurfaceUrl) {
    targetUrl = slot.darkSurfaceUrl;
  }

  if (srcParam && (slot.currentUrl === srcParam || (slot.alternatives ?? []).includes(srcParam))) {
    targetUrl = srcParam;
  }

  return targetUrl;
}
