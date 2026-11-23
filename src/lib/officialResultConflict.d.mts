export type OfficialResultConflictSummary = {
  schemaVersion: 1;
  status: "unresolved" | "resolved";
  raceId: string;
  conflictId: string;
  changedFields: string[];
  previousSignatureSha256: string;
  candidateSignatureSha256: string;
  evidenceSha256: string;
  firstDetectedAt: string;
  lastObservedAt: string;
  resolution?: { action: "accept-candidate"; conflictId: string; evidenceSha256: string; approvedBy: string; approvedAt: string };
};
export const OFFICIAL_CONFLICT_HOLD_LABEL: string;
export function isOfficialResultOnHold(race: unknown): boolean;
export function conflictSummary(marker: OfficialResultConflictSummary): OfficialResultConflictSummary;
export function withOfficialResultHold<T>(race: T, marker?: OfficialResultConflictSummary): T & {
  officialResultConflict: OfficialResultConflictSummary;
  resultStatus: "pending";
  raceOperationStatus: "unknown";
  raceOperationLabel: string;
  resultNote: string;
  resultTop3: [];
  payouts: [];
  result: { status: "pending"; reviewSettlementEligible: false; officialResultConflict: OfficialResultConflictSummary };
};
export function attachOfficialConflictHolds<T>(feed: T, official: unknown): T;
