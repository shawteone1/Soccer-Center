export const providers = ["Mindbody", "Playpass", "Square"] as const;
export type Provider = (typeof providers)[number];
export const CLOCK = "2026-11-13T16:00:00Z";
export const KEY = "sc_city_connect_demo_v1";
export const people = [
  {
    id: "parent",
    household: "rivera",
    name: "Jordan Rivera",
    role: "Parent / member",
  },
  {
    id: "athlete",
    household: "rivera",
    name: "Alex Rivera",
    role: "Participant · age 12",
  },
  {
    id: "other",
    household: "chen",
    name: "Alex Rivera",
    role: "Unrelated household · never auto-merged",
  },
];
export interface SourceRecord {
  provider: Provider;
  account: string;
  kind: "membership" | "registration" | "transaction" | "event" | "requirement";
  sourceId: string;
  personId: string | null;
  title: string;
  rawStatus: string;
  status: string;
  sourceUpdatedAt: string;
  importedAt: string;
  startAt?: string;
  endAt?: string;
  location?: string;
  renewal?: string;
}
export const recordKey = (r: SourceRecord) =>
  `${r.provider}:${r.account}:${r.kind}:${r.sourceId}`;
export interface Adapter {
  provider: Provider;
  mode: "simulated";
  access: "read-only";
  maxAttempts: number;
  read: (fail: boolean) => SourceRecord[];
}
export interface Health {
  lastAttempt: string;
  lastSuccess: string;
  error: string | null;
  attempts: number;
  stale: boolean;
}
export interface Audit {
  id: number;
  at: string;
  actor: string;
  action: string;
  source: string;
  before: string;
  after: string;
  mode: "simulated";
}
export interface State {
  version: 1;
  records: Record<string, SourceRecord>;
  health: Record<Provider, Health>;
  resolutions: Record<string, { at: string; note: string }>;
  audit: Audit[];
}
export function source(
  provider: Provider,
  kind: SourceRecord["kind"],
  sourceId: string,
  personId: string | null,
  title: string,
  rawStatus: string,
  status: string,
  extra: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    provider,
    account: "fictional-soccer-city",
    kind,
    sourceId,
    personId,
    title,
    rawStatus,
    status,
    sourceUpdatedAt: "2026-11-13T15:00:00Z",
    importedAt: CLOCK,
    ...extra,
  };
}
