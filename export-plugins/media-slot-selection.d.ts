/** The `MediaSlot` fields the preview route's selectors read — a structural subset of the shared `MediaSlot`. */
export interface MediaSlotSelectionFields {
  currentUrl?: string;
  lightSurfaceUrl?: string;
  darkSurfaceUrl?: string;
  alternatives?: string[];
}

export function parseSlotPath(
  pathname: string,
  prefix: string,
): { slotPath: string; surfaceVariant: 'light' | 'dark' | null } | null;

export function resolveSlotTargetUrl(
  slot: MediaSlotSelectionFields,
  surfaceVariant: 'light' | 'dark' | null,
  srcParam: string | null,
): string;
