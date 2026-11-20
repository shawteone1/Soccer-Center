import type { PilotSetup } from "./pilot";
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
  organizationId?: string;
  sourceSubjectId?: string;
  programId?: string;
  dataMode?: "contract-fixture" | "sandbox";
  account: string;
  kind:
    | "membership"
    | "registration"
    | "transaction"
    | "event"
    | "requirement"
    | "client"
    | "location"
    | "program";
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
  r.organizationId
    ? JSON.stringify([
        r.organizationId,
        r.provider,
        r.account,
        r.kind,
        r.sourceId,
      ])
    : `${r.provider}:${r.account}:${r.kind}:${r.sourceId}`;
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
  retryAt?: string;
}
export interface Audit {
  id: number;
  at: string;
  actor: string;
  action: string;
  source: string;
  before: string;
  after: string;
  mode: "simulated" | "sandbox";
}
export interface State {
  version: 1;
  pilot?: PilotSetup;
  records: Record<string, SourceRecord>;
  health: Record<Provider, Health>;
  resolutions: Record<string, { at: string; note: string }>;
  tasks: Record<string, LocalTask>;
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

export const staff = [
  { id: "morgan", name: "Morgan Lee", role: "Duty lead" },
  { id: "casey", name: "Casey Brooks", role: "Member services" },
] as const;
export interface FollowUpNote {
  id: number;
  at: string;
  actor: string;
  text: string;
}
export interface LocalTask {
  sourceKey: string;
  title: string;
  priority: "High" | "Normal";
  assigneeId: string | null;
  dueOn: string;
  createdAt: string;
  updatedAt: string;
  notes: FollowUpNote[];
}
