/**
 * AO review-only. Internal feed/snapshot trust, NOT an independent official-site verification.
 * Require exact 4-key, documented JSJ001/JSJ006 generator attestation, identical source bytes SHA256,
 * and consistent *explicit* rider registration numbers. No name- or similar-player fallback.
 */
import { resolvePredictionGptSourceMetadata } from './predictionGptSourceContract';

export type OfficialEntryRow = {
  carNo?: unknown; registrationNo?: unknown; name?: unknown;
  prefecture?: unknown; graduationTerm?: unknown; raceClass?: unknown; source?: unknown;
};
type Crosscheck = {
  status?: unknown; date?: unknown; venueCode?: unknown; raceNo?: unknown;
  rowCount?: unknown; entryType?: unknown; detailType?: unknown;
};
export type OfficialEntryRace = {
  raceNumber?: unknown;
  quality?: { entryDetailCrosscheck?: Crosscheck };
  entries?: OfficialEntryRow[];
};
export type OfficialRegistrationSnapshot = {
  date?: unknown;
  source?: { provider?: unknown; entryType?: unknown; detailType?: unknown; fetchCompletedAt?: unknown };
  venues?: Array<{ date?: unknown; venueCode?: unknown; races?: OfficialEntryRace[] }>;
};
export type StrictRegistrationEvidence = {
  snapshot: OfficialRegistrationSnapshot | null;
  expectedSha256: string;
  actualSha256: string;
};
export type RegistrationRider = {
  carNo?: unknown; name?: unknown; fullName?: unknown;
  registrationNo?: unknown; registration?: unknown;
  registrationNumber?: unknown; registrationId?: unknown;
  prefecture?: unknown; term?: unknown; age?: unknown;
  className?: unknown; grade?: unknown;
};
export type RegistrationDecision = {
  registrationNo: string; source: string; status: string;
  fetchedAt: string; evidence: string; reason: string;
};
type OfficialCandidate = {
  entry: OfficialEntryRow; race: OfficialEntryRace;
  venueCode: string; raceNo: string; rowCount: number;
};
export type StrictRegistrationIndex = {
  valid: boolean; reason: string; fetchedAt: string;
  keyedRows: Map<string, OfficialCandidate[]>;
};
const clean = (x: unknown): string => String(x ?? '').normalize('NFKC').trim();
const notEmpty = (x: unknown): string => {
  const s = clean(x);
  return !s || /^(?:null|undefined|unknown)$/iu.test(s) ? '' : s;
};
const unsigned = (x: unknown): string => {
  const s = notEmpty(x);
  return /^\d+$/u.test(s) ? String(Number(s)) : '';
};
const regNo = (x: unknown): string => {
  // Upstream scripts/lib/official-today-source.mjs permits 5 OR 6 ASCII digits.
  // Never pad, trim leading zeroes, or invent an ID.
  const s = notEmpty(x);
  return /^[0-9]{5,6}$/u.test(s) ? s : '';
};
const name = (x: unknown): string => notEmpty(x).replace(/[\s\u3000・]/gu,'');
const pref = (x: unknown): string => name(x).replace(/[都道府県]$/u,'');
const term = (x: unknown): string => name(x).replace(/期$/u,'');
const day = (x: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/u.test(notEmpty(x));
const sha = (x: unknown): boolean => /^[a-f0-9]{64}$/u.test(notEmpty(x));
const stamp = (x: unknown): boolean => {
  const s = notEmpty(x);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(s) && Number.isFinite(Date.parse(s));
};
const key = (d: unknown, v: unknown, r: unknown, c: unknown): string =>
  [notEmpty(d), unsigned(v), unsigned(r), unsigned(c)].join('|');
const blocked = (status: string, reason: string): RegistrationDecision => ({
  registrationNo: 'null', source: 'none', status, fetchedAt: 'null',
  evidence: 'not-verified', reason,
});
const invalidIndex = (reason: string): StrictRegistrationIndex => ({
  valid: false, reason, fetchedAt: '', keyedRows: new Map(),
});

/** Strictly reject duplicate keys even when duplicates carry the same ID. */
export function indexOfficialRegistrationSnapshot(snapshot: OfficialRegistrationSnapshot | null | undefined): StrictRegistrationIndex {
  const src = snapshot?.source;
  if (!snapshot || src?.provider !== 'KEIRIN.JP' || src.entryType !== 'JSJ006' || src.detailType !== 'JSJ001')
    return invalidIndex('provider-or-schema-unverified');
  if (!day(snapshot.date) || !stamp(src.fetchCompletedAt)) return invalidIndex('date-or-timestamp-unverified');
  if (!Array.isArray(snapshot.venues) || !snapshot.venues.length) return invalidIndex('venues-missing');
  const keyedRows = new Map<string, OfficialCandidate[]>();
  const venues = new Set<string>();
  const races = new Set<string>();
  for (const venue of snapshot.venues) {
    const venueCode = unsigned(venue.venueCode);
    if (venue.date !== snapshot.date || !/^[0-9]{1,2}$/u.test(venueCode) || !Array.isArray(venue.races) || !venue.races.length)
      return invalidIndex('venue-or-date-inconsistent');
    if (venues.has(venueCode)) return invalidIndex('duplicate-venue');
    venues.add(venueCode);
    for (const race of venue.races) {
      const raceNo = unsigned(race.raceNumber);
      const raceKey = key(snapshot.date, venueCode, raceNo, 0);
      if (!raceNo || Number(raceNo) < 1 || Number(raceNo) > 12 || races.has(raceKey))
        return invalidIndex('duplicate-or-invalid-race');
      races.add(raceKey);
      if (!Array.isArray(race.entries) || !race.entries.length) return invalidIndex('entries-missing');
      const regNos = new Set<string>();
      for (const entry of race.entries) {
        const car = unsigned(entry.carNo);
        const id = regNo(entry.registrationNo);
        if (!/^[1-9]$/u.test(car) || !id || !name(entry.name) || entry.source !== 'KEIRIN.JP:JSJ006' || regNos.has(id))
          return invalidIndex('invalid-or-duplicate-rider');
        regNos.add(id);
        const k = key(snapshot.date, venueCode, raceNo, car);
        if (keyedRows.has(k)) return invalidIndex('duplicate-exact-key');
        keyedRows.set(k, [{entry, race, venueCode, raceNo, rowCount:race.entries.length}]);
      }
    }
  }
  return {valid:true,reason:'',fetchedAt:notEmpty(src.fetchCompletedAt),keyedRows};
}

export function resolveStrictRegistration({date, venueCode, raceNo, rider, evidence, index}: {
  date: unknown; venueCode: unknown; raceNo: unknown;
  rider: RegistrationRider; evidence: StrictRegistrationEvidence | null;
  index: StrictRegistrationIndex | null;
}): RegistrationDecision {
  if (!day(date) || !/^[0-9]{1,2}$/u.test(unsigned(venueCode)) || !/^(?:[1-9]|1[0-2])$/u.test(unsigned(raceNo)) || !/^[1-9]$/u.test(unsigned(rider.carNo)))
    return blocked('key-invalid-blocked','date/venueCode/raceNo/carNo invalid');
  const aliases = [rider.registrationNo,rider.registration,rider.registrationNumber,rider.registrationId].map(notEmpty).filter(Boolean);
  if (!aliases.length) return blocked('id-missing-blocked','no explicit registration number');
  if (new Set(aliases).size !== 1) return blocked('alias-conflict-blocked','registration aliases disagree');
  const explicit = regNo(aliases[0]);
  if (!explicit) return blocked('id-format-blocked','registration number must be 5 or 6 ASCII digits');
  if (!evidence || !index?.valid || !evidence.snapshot) return blocked('snapshot-unverified-blocked',index?.reason || 'source evidence missing');
  if (!sha(evidence.expectedSha256) || evidence.expectedSha256 !== evidence.actualSha256)
    return blocked('version-mismatch-blocked','official source bytes differ from today manifest');
  if (evidence.snapshot.date !== date) return blocked('date-mismatch-blocked','snapshot day differs');
  const found = index.keyedRows.get(key(date,venueCode,raceNo,rider.carNo)) || [];
  if (found.length !== 1) return blocked('exact-key-blocked','expected exactly one official row');
  const candidate = found[0];
  if (candidate.entry.registrationNo !== explicit) return blocked('id-conflict-blocked','rider and official registration number differ');
  if (!name(rider.fullName ?? rider.name) || name(rider.fullName ?? rider.name) !== name(candidate.entry.name))
    return blocked('name-conflict-blocked','missing or mismatched rider name');
  if (notEmpty(rider.prefecture) && pref(rider.prefecture) !== pref(candidate.entry.prefecture))
    return blocked('pref-conflict-blocked','prefecture differs');
  if (notEmpty(rider.term) && term(rider.term) !== term(candidate.entry.graduationTerm))
    return blocked('term-conflict-blocked','graduation term differs');
  const x = candidate.race.quality?.entryDetailCrosscheck;
  if (x?.status !== 'PASS_JSJ001_JSJ006_EXACT' || x.date !== date || unsigned(x.venueCode) !== unsigned(venueCode)
    || unsigned(x.raceNo) !== unsigned(raceNo) || Number(x.rowCount) !== candidate.rowCount
    || x.entryType !== 'JSJ006' || x.detailType !== 'JSJ001')
    return blocked('crosscheck-unverified-blocked','per-race JSJ001/JSJ006 evidence missing or inconsistent');
  return {registrationNo:explicit,source:'KEIRIN.JP:JSJ006',status:'internal-feed-exact-match',
    fetchedAt:index.fetchedAt,evidence:'internal-generated-feed-only',
    reason:'exact key, explicit ID, recorded JSJ001/JSJ006 check and identical SHA256 source bytes'};
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return '';
  const digest = await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/** This contract never calls name-based registries to populate numbers. */
export function buildStrictOfficialRegistrationMaterial({date,feed,venue,race,riders,evidence,index}: {
  date: unknown;
  feed?: {generatedAt?:unknown;sourceName?:unknown;sourceFetchedAt?:unknown;sourceType?:unknown}|null;
  venue: {venue?:unknown;venueCode?:unknown;sourceName?:unknown;sourceFetchedAt?:unknown;sourceType?:unknown;venueOperationSource?:unknown;venueOperationUpdatedAt?:unknown};
  race: {raceNo?:unknown;sourceName?:unknown;sourceFetchedAt?:unknown;sourceType?:unknown;raceOperationSource?:unknown;raceOperationUpdatedAt?:unknown};
  riders: RegistrationRider[]; evidence: StrictRegistrationEvidence|null;
  index: StrictRegistrationIndex|null;
}): string {
  const source = resolvePredictionGptSourceMetadata({feed,venue,race});
  const safe = (v: unknown) => (notEmpty(v) || 'null').replace(/[\r\n\t|]/gu,' ');
  const rows = riders.map(rider=>{
    const decision=resolveStrictRegistration({date,venueCode:venue.venueCode,raceNo:race.raceNo,rider,evidence,index});
    return [safe(rider.carNo),safe(rider.fullName??rider.name),decision.registrationNo,decision.source,
      decision.status,safe(rider.prefecture),safe(rider.age),safe(rider.term),safe(rider.className??rider.grade),
      decision.fetchedAt,decision.evidence,decision.reason].join(' / ');
  });
  return [
    '【EX source contract】',
    'date: '+safe(date), 'venue: '+safe(venue.venue),'venueCode: '+safe(venue.venueCode),
    'raceNumber: '+safe(race.raceNo),'sourceName: '+safe(source.sourceName),
    'sourceFetchedAt: '+safe(source.sourceFetchedAt),'sourceType: '+safe(source.sourceType),
    'registrationNoProof: internal-generated-feed-only; NOT independent official player verification',
    '', '【出走表】',
    '車番 / 選手名 / 登録番号 / 登録番号source / 登録番号status / 府県 / 年齢 / 期 / 級班 / 登録番号取得日時 / 登録番号証拠水準 / 登録番号保留理由',
    ...(rows.length?rows:['null / null / null / none / unavailable / null / null / null / null / null / not-verified / no riders']),
  ].join('\n');
}
