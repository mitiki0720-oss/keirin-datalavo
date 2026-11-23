import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { mergeWithExisting, raceResultSignature, validateOfficialResultIdentity, createRaceResult, summarize, describeSettledResultConflict } from "./update-keirin-jp-results.mjs";
import { isOfficialResultOnHold, conflictSummary } from "../src/lib/officialResultConflict.mjs";
import { officialResultToTodayRace } from "./lib/official-today-source.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verifiedProofs = new WeakMap();
const digest = value => createHash("sha256").update(value).digest("hex");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export async function loadOfficialConflictProof(manifestFile) {
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const target = manifest.target;
  assert(validDate(target?.date) && /^\d{2}$/u.test(target.venueCode) && Number.isInteger(target.raceNumber)
    && target.raceNumber >= 1 && target.raceNumber <= 12 && Array.isArray(manifest.records), "INVALID_PROOF_MANIFEST");
  const raw = {}, records = [];
  for (const type of ["JSJ012", "JSJ006", "JSJ001"]) {
    // Select the race response by its content identity, not by the acquisition filename.
    const candidates = manifest.records.filter(row => row.type === type);
    let selected;
    for (const record of candidates) {
      assert(typeof record.file === "string" && path.basename(record.file) === record.file, "INVALID_PROOF_PATH");
      const url = new URL(record.url), finalUrl = new URL(record.finalUrl);
      assert(record.status === 200 && [url, finalUrl].every(value => value.origin === "https://keirin.jp"
        && value.pathname === "/pc/json" && !value.username && !value.password && value.searchParams.get("type") === type), "UNOFFICIAL_PROOF_SOURCE");
      const bytes = await fs.readFile(path.join(path.dirname(manifestFile), "raw", record.file));
      assert(digest(bytes) === record.sha256, "PROOF_SHA_MISMATCH");
      assert(Number.isFinite(Date.parse(record.fetchedAt)) && Date.parse(record.fetchedAt) <= Date.now() + 120_000
        && new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date(record.fetchedAt)) === target.date, "INVALID_PROOF_TIME");
      const value = JSON.parse(bytes.toString("utf8"));
      if (type === "JSJ001" && Number(value.C0201data?.selRaceNo) !== target.raceNumber) continue;
      assert(!selected, "DUPLICATE_RACE_PROOF"); selected = { value, record };
    }
    assert(selected, `MISSING_RACE_PROOF_${type}`);
      raw[type] = selected.value;
      records.push({ ...selected.record, bodyBase64: (await fs.readFile(path.join(path.dirname(manifestFile), "raw", selected.record.file))).toString("base64") });
  }
  return createOfficialConflictProof(target, raw, records);
}

export function createOfficialConflictProof(target, raw, records) {
  assert(validDate(target?.date) && /^\d{2}$/u.test(target.venueCode)
    && Number.isInteger(target.raceNumber) && target.raceNumber >= 1 && target.raceNumber <= 12, "INVALID_PROOF_TARGET");
  for (const type of ["JSJ012", "JSJ006", "JSJ001"]) {
    const matching = records.filter(row => row.type === type);
    assert(matching.length === 1, "MISSING_OR_DUPLICATE_API_PROOF");
    const record = matching[0], bytes = Buffer.from(record.bodyBase64, "base64");
    assert(digest(bytes) === record.sha256 && isDeepStrictEqual(JSON.parse(bytes.toString("utf8")), raw[type]), "PROOF_SHA_MISMATCH");
    assert(record.status === 200 && [record.url, record.finalUrl].every(value => {
      const url = new URL(value);
      return url.origin === "https://keirin.jp" && url.pathname === "/pc/json" && url.searchParams.get("type") === type && !url.username && !url.password;
    }), "UNOFFICIAL_PROOF_SOURCE");
    assert(Number.isFinite(Date.parse(record.fetchedAt)) && Date.parse(record.fetchedAt) <= Date.now() + 120000, "INVALID_PROOF_TIME");
  }
  const publication = validateOfficialResultIdentity({ ...target, data: raw.JSJ012, entries: raw.JSJ006, detail: raw.JSJ001 });
  const result = createRaceResult(target.raceNumber, raw.JSJ001.C0201data.C0201race[target.raceNumber - 1], raw.JSJ012, publication);
  assert(result.resultStatus === "confirmed", "CONFIRMED_CONFLICT_PROOF_REQUIRED");
  const entries = { entries: raw.JSJ006.sensyuTypeInfo.map(row => ({
    carNo: String(row.syaban), registrationNo: row.sensyuRegistNo, name: row.sensyuName })) };
  assert(officialResultToTodayRace(result, entries)?.resultStatus === "confirmed", "OFFICIAL_PAYOUT_ORDER_CONTRADICTION");
  const proof = { target, raw, records, result, signature: raceResultSignature(result) };
  verifiedProofs.set(proof, structuredClone(proof));
  return proof;
}

export function verifyStoredOfficialConflict(race, raceId, evidenceBundle) {
  const marker = race.officialResultConflict;
  assert(marker?.schemaVersion === 1 && ["unresolved", "resolved"].includes(marker.status)
    && marker.raceId === raceId && Array.isArray(marker.changedFields) && marker.changedFields.length
    && Number.isFinite(Date.parse(marker.firstDetectedAt)) && Number.isFinite(Date.parse(marker.lastObservedAt)), "INVALID_STORED_CONFLICT");
  assert(Array.isArray(marker.evidence) && marker.evidence.length === 3, "STORED_CONFLICT_EVIDENCE_MISSING");
  for (const type of ["JSJ012", "JSJ006", "JSJ001"]) {
    const matching = marker.evidence.filter(row => row.type === type);
    assert(matching.length === 1 && matching[0].status === 200 && /^[a-f0-9]{64}$/u.test(matching[0].sha256)
      && Number.isFinite(Date.parse(matching[0].fetchedAt))
      && matching[0].url === `https://keirin.jp/pc/json?type=${type}`
      && !matching[0].bodyBase64, "INVALID_PUBLIC_CONFLICT_PROVENANCE");
  }
  assert(digest(JSON.stringify(marker.evidence)) === marker.evidenceSha256
    && /^[a-f0-9]{64}$/u.test(marker.evidenceBundleSha256)
    && digest(raceResultSignature(marker.candidate)) === marker.candidateSignatureSha256
    && digest(raceResultSignature(marker.previous)) === marker.previousSignatureSha256
    && marker.conflictId === digest(`${raceId}:${marker.previousSignatureSha256}:${marker.candidateSignatureSha256}`), "STORED_CONFLICT_EVIDENCE_MISMATCH");
  assertSameRiders(marker.previous, marker.candidate);
  if (evidenceBundle) {
    assert([marker.evidenceBundleSha256, marker.lastEvidenceBundleSha256].includes(digest(JSON.stringify(evidenceBundle))), "PRIVATE_EVIDENCE_BUNDLE_SHA_MISMATCH");
    const raw = Object.fromEntries(evidenceBundle.records.map(row => [row.type, JSON.parse(Buffer.from(row.bodyBase64, "base64").toString("utf8"))]));
    const proof = createOfficialConflictProof(evidenceBundle.target, raw, evidenceBundle.records);
    assert(`${proof.target.date}:${proof.target.venueCode}:${proof.target.raceNumber}` === raceId
      && digest(proof.signature) === marker.candidateSignatureSha256, "PRIVATE_EVIDENCE_RESULT_MISMATCH");
  }
  assert(isDeepStrictEqual(marker.changedFields,
    describeSettledResultConflict(raceId, marker.previous, marker.candidate).changedFields), "STORED_CONFLICT_FIELDS_MISMATCH");
  assert(digest(raceResultSignature(race)) === (marker.status === "unresolved" ? marker.previousSignatureSha256 : marker.candidateSignatureSha256), "STORED_CONFLICT_RESULT_MISMATCH");
  if (marker.status === "resolved") assert(marker.resolution?.action === "accept-candidate"
    && marker.resolution.conflictId === marker.conflictId && marker.resolution.evidenceSha256 === marker.evidenceSha256
    && marker.resolution.approvedBy?.trim() && Number.isFinite(Date.parse(marker.resolution.approvedAt)), "INVALID_CONFLICT_RESOLUTION");
  return marker;
}

export function mergeOfficialResultsWithConflictIsolation(existing, candidate, proofs = [], approvals = [], { resolutionSnapshot } = {}) {
  raceIndex(candidate);
  assert(Array.isArray(approvals), "INVALID_CONFLICT_APPROVALS");
  if (!existing || existing.date !== candidate.date) {
    assert(approvals.length === 0, "UNMATCHED_CONFLICT_APPROVAL");
    const result = mergeWithExisting(null, structuredClone(candidate));
    result.payload.conflictRaceCount = 0;
    result.payload.verifiedConfirmedRaceCount = result.payload.confirmedRaceCount;
    attachConflictRegistry(result.payload, existing, resolutionSnapshot);
    return { ...result, conflicts: [], evidenceBundles: [] };
  }
  const oldIndex = raceIndex(existing);
  for (const [raceId, { race }] of oldIndex) if (race.officialResultConflict) verifyStoredOfficialConflict(race, raceId);
  const plan = planOfficialResultConflictIsolation(existing, candidate, proofs);
  const conflicts = new Map(plan.quarantined.map(row => [row.raceId, row]));
  const previousByKey = new Map([...oldIndex].map(([key, value]) => [key, value.race]));
  const updates = new Map(plan.normalUpdates.map(row => [row.raceId, row.candidate]));
  const consumedApprovals = new Set();
  const evidenceBundles = [];
  const venues = candidate.venues.map(venue => ({ ...venue, races: venue.races.map(incoming => {
    const raceId = `${candidate.date}:${venue.venueCode}:${incoming.raceNumber}`;
    const previous = previousByKey.get(raceId), conflict = conflicts.get(raceId);
    let selected = structuredClone(updates.get(raceId) ?? previous ?? incoming);
    let marker = previous?.officialResultConflict;
    if (conflict) {
      const proof = proofs.find(row => `${row.target.date}:${row.target.venueCode}:${row.target.raceNumber}` === raceId);
      const before = structuredClone(previous); delete before.officialResultConflict;
      const candidateResult = structuredClone(incoming); delete candidateResult.officialResultConflict;
      const previousSignatureSha256 = digest(raceResultSignature(before)), candidateSignatureSha256 = digest(raceResultSignature(candidateResult));
      const conflictId = digest(`${raceId}:${previousSignatureSha256}:${candidateSignatureSha256}`);
      const unchangedConflict = marker?.status === "unresolved" && marker.conflictId === conflictId;
      const bundle = { schemaVersion: "official-conflict-evidence-v1", target: structuredClone(proof.target), records: structuredClone(proof.records) };
      const bundleSha256 = digest(JSON.stringify(bundle));
      evidenceBundles.push({ sha256: bundleSha256, bundle });
      const currentEvidence = proof.records.map(({ type, fetchedAt, sha256, status }) => ({
        type, url: `https://keirin.jp/pc/json?type=${type}`, fetchedAt, sha256, status }));
      const evidence = unchangedConflict ? marker.evidence : currentEvidence;
      const observedAt = currentEvidence.map(row => row.fetchedAt).sort().at(-1);
      marker = { schemaVersion: 1, status: "unresolved", raceId, conflictId,
        changedFields: conflict.comparison.changedFields, previousSignatureSha256, candidateSignatureSha256,
        firstDetectedAt: unchangedConflict ? marker.firstDetectedAt : observedAt, lastObservedAt: observedAt,
        evidence, evidenceSha256: digest(JSON.stringify(evidence)),
        evidenceBundleSha256: unchangedConflict ? marker.evidenceBundleSha256 : bundleSha256,
        lastEvidenceBundleSha256: bundleSha256, previous: before,
        candidate: unchangedConflict ? marker.candidate : candidateResult,
        history: unchangedConflict ? marker.history ?? [] : marker ? [...(marker.history ?? []), marker] : [] };
      selected = before;
    }
    if (marker?.status === "unresolved") {
      // Even a reversion to the retained value cannot silently clear an existing hold.
      selected = structuredClone(marker.previous);
      const matching = approvals.filter(row => row.raceId === raceId);
      assert(matching.length <= 1, "DUPLICATE_CONFLICT_APPROVAL");
      if (matching.length) {
        const approval = matching[0];
        assert(approval.action === "accept-candidate" && approval.conflictId === marker.conflictId
          && approval.evidenceSha256 === marker.evidenceSha256 && approval.approvedBy?.trim()
          && Number.isFinite(Date.parse(approval.approvedAt)) && Date.parse(approval.approvedAt) <= Date.now() + 120000
          && incoming.resultStatus === "confirmed" && digest(raceResultSignature(incoming)) === marker.candidateSignatureSha256,
        "EXPLICIT_MATCHING_CONFLICT_APPROVAL_REQUIRED");
        selected = structuredClone(marker.candidate);
        marker = { ...marker, status: "resolved", resolution: structuredClone(approval) };
        consumedApprovals.add(approval);
      }
    }
    if (marker) selected.officialResultConflict = structuredClone(marker);
    return selected;
  }) }));
  assert(consumedApprovals.size === approvals.length, "UNMATCHED_CONFLICT_APPROVAL");
  const payload = summarize({ ...candidate, venues });
  const unresolved = venues.flatMap(venue => venue.races.filter(isOfficialResultOnHold).map(race => ({
    raceId: race.officialResultConflict.raceId, changedFields: race.officialResultConflict.changedFields,
    conflictId: race.officialResultConflict.conflictId, evidenceSha256: race.officialResultConflict.evidenceSha256 })));
  payload.conflictRaceCount = unresolved.length;
  payload.verifiedConfirmedRaceCount = payload.confirmedRaceCount - unresolved.length;
  attachConflictRegistry(payload, existing, resolutionSnapshot);
  return { payload, conflicts: unresolved, evidenceBundles, preservedSettledRaceCount: plan.retained.length };
}

export function validateOfficialConflictRegistry(payload) {
  const entries = payload.officialResultConflictRegistry ?? [];
  assert(Array.isArray(entries), "INVALID_CONFLICT_REGISTRY");
  const seen = new Set();
  for (const entry of entries) {
    assert(entry.schemaVersion === 1 && entry.provider === "KEIRIN.JP" && validDate(entry.date)
      && /^\d{2}$/u.test(entry.venueCode) && Number.isInteger(entry.raceNumber) && entry.raceNumber >= 1 && entry.raceNumber <= 12
      && entry.raceId === `${entry.date}:${entry.venueCode}:${entry.raceNumber}` && !seen.has(entry.raceId)
      && typeof entry.venueName === "string" && entry.venueName.trim() && ["unresolved", "resolved"].includes(entry.status)
      && [entry.conflictId, entry.previousSignatureSha256, entry.candidateSignatureSha256, entry.evidenceSha256].every(value => /^[a-f0-9]{64}$/u.test(value))
      && Array.isArray(entry.changedFields) && entry.changedFields.length, "INVALID_CONFLICT_REGISTRY_ENTRY");
    if (entry.status === "resolved") assert(!isOfficialResultOnHold({ officialResultConflict: entry }), "INVALID_REGISTRY_RESOLUTION");
    seen.add(entry.raceId);
  }
  return entries;
}

function attachConflictRegistry(payload, previous, resolutionSnapshot) {
  const registry = new Map(validateOfficialConflictRegistry(previous ?? {}).map(entry => [entry.raceId, structuredClone(entry)]));
  const addMarkers = (snapshot, explicitImport = false) => {
    for (const venue of snapshot?.venues ?? []) for (const race of venue.races ?? []) {
      if (!race.officialResultConflict) continue;
      const raceId = `${snapshot.date}:${venue.venueCode}:${race.raceNumber}`;
      const marker = verifyStoredOfficialConflict(race, raceId);
      if (explicitImport && marker.status === "resolved") assert(registry.get(raceId)?.conflictId === marker.conflictId, "UNMATCHED_HISTORICAL_RESOLUTION");
      registry.set(raceId, { ...conflictSummary(marker), provider: "KEIRIN.JP", date: snapshot.date,
        venueCode: venue.venueCode, venueName: venue.venueName, raceNumber: race.raceNumber });
    }
  };
  addMarkers(previous);
  addMarkers(payload);
  if (resolutionSnapshot) { raceIndex(resolutionSnapshot); addMarkers(resolutionSnapshot, true); }
  if (registry.size) payload.officialResultConflictRegistry = [...registry.values()].sort((a, b) => a.raceId.localeCompare(b.raceId));
  validateOfficialConflictRegistry(payload);
}

export async function verifyConflictRegistryImport(snapshot, targetDate) {
  raceIndex(snapshot);
  assert(snapshot.date !== targetDate, "REGISTRY_IMPORT_MUST_BE_SEPARATE_DATE");
  let count = 0;
  for (const venue of snapshot.venues) for (const race of venue.races) {
    const marker = race.officialResultConflict;
    if (!marker) continue;
    verifyStoredOfficialConflict(race, `${snapshot.date}:${venue.venueCode}:${race.raceNumber}`);
    let bundle;
    for (const hash of [marker.evidenceBundleSha256, marker.lastEvidenceBundleSha256].filter(Boolean)) {
      assert(/^[a-f0-9]{64}$/u.test(hash), "PRIVATE_EVIDENCE_BUNDLE_SHA_MISMATCH");
      const file = path.join(repository, ".tmp/official-result-conflicts", snapshot.date, `${hash}.json`);
      const bytes = await fs.readFile(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (!bytes) continue;
      assert(digest(bytes) === hash, "PRIVATE_EVIDENCE_BUNDLE_SHA_MISMATCH");
      bundle = JSON.parse(bytes.toString("utf8")); break;
    }
    assert(bundle, "PRIVATE_EVIDENCE_BUNDLE_MISSING");
    verifyStoredOfficialConflict(race, `${snapshot.date}:${venue.venueCode}:${race.raceNumber}`, bundle);
    count++;
  }
  assert(count > 0, "REGISTRY_IMPORT_CONFLICT_MISSING");
  return count;
}

export async function persistOfficialConflictEvidence(evidenceBundles) {
  const outputRoot = path.join(repository, ".tmp/official-result-conflicts");
  const files = [];
  if (evidenceBundles?.length) {
    await fs.mkdir(outputRoot, { recursive: true });
    assert(path.resolve(await fs.realpath(outputRoot)) === path.resolve(outputRoot), "PRIVATE_EVIDENCE_DIRECTORY_REDIRECTED");
  }
  for (const { sha256, bundle } of evidenceBundles ?? []) {
    assert(validDate(bundle.target.date) && sha256 === digest(JSON.stringify(bundle)), "PRIVATE_EVIDENCE_BUNDLE_SHA_MISMATCH");
    const directory = path.join(outputRoot, bundle.target.date);
    await fs.mkdir(directory, { recursive: true });
    assert(path.resolve(await fs.realpath(directory)) === path.resolve(directory), "PRIVATE_EVIDENCE_DIRECTORY_REDIRECTED");
    const file = path.join(directory, `${sha256}.json`), bytes = Buffer.from(JSON.stringify(bundle));
    try { await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if (error.code !== "EEXIST" || !(await fs.readFile(file)).equals(bytes)) throw error;
    }
    files.push({ file, sha256 });
  }
  return files;
}

function raceIndex(snapshot) {
  assert(validDate(snapshot?.date) && snapshot.source?.provider === "KEIRIN.JP" && Array.isArray(snapshot.venues)
    && snapshot.venues.length && snapshot.errorCount === 0, "INVALID_OR_ERRORED_SNAPSHOT");
  const index = new Map(), venues = new Set();
  for (const venue of snapshot.venues) {
    assert(venue.date === snapshot.date && /^\d{2}$/u.test(venue.venueCode) && !venues.has(venue.venueCode)
      && Array.isArray(venue.races) && venue.races.length, "INVALID_VENUE_IDENTITY");
    venues.add(venue.venueCode);
    for (const race of venue.races) {
      const key = `${snapshot.date}:${venue.venueCode}:${race.raceNumber}`;
      assert(Number.isInteger(race.raceNumber) && race.raceNumber >= 1 && race.raceNumber <= 12 && !index.has(key)
        && ["confirmed", "pending", "partial"].includes(race.resultStatus), "INVALID_RACE_IDENTITY_OR_STATUS");
      index.set(key, { venue, race });
    }
  }
  assert(index.size === snapshot.raceCount && venues.size === snapshot.venueCount, "SNAPSHOT_COUNT_MISMATCH");
  return index;
}

function assertSameRiders(previous, candidate) {
  const ids = race => race.finishOrder.map(row => [row.carNo, row.registrationNo, String(row.name).normalize("NFKC").replace(/\s/gu, "")])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const oldIds = ids(previous), newIds = ids(candidate);
  assert(oldIds.length >= 5 && isDeepStrictEqual(oldIds, newIds)
    && new Set(oldIds.map(row => row[0])).size === oldIds.length
    && new Set(oldIds.map(row => row[1])).size === oldIds.length
    && oldIds.every(row => /^[1-9]$/u.test(row[0]) && /^\d{6}$/u.test(row[1])), "CONFLICT_RIDER_IDENTITY_MISMATCH");
}

export function planOfficialResultConflictIsolation(existing, candidate, proofs = []) {
  assert(existing?.date === candidate?.date, "SNAPSHOT_DATE_MISMATCH");
  const oldIndex = raceIndex(existing), nextIndex = raceIndex(candidate);
  for (const key of oldIndex.keys()) assert(nextIndex.has(key), "SNAPSHOT_RACE_SET_REGRESSION");
  const normalUpdates = [], retained = [], quarantined = [];
  for (const [raceId, next] of nextIndex) {
    const old = oldIndex.get(raceId);
    if (!old) { normalUpdates.push({ raceId, candidate: structuredClone(next.race) }); continue; }
    assert(old.venue.venueName.normalize("NFKC").replace(/\s/gu, "") === next.venue.venueName.normalize("NFKC").replace(/\s/gu, ""), "VENUE_NAME_MISMATCH");
    const mini = value => ({ ...value, venueCount: 1, raceCount: 1, venues: [{ ...next.venue, races: [] }] });
    const before = mini(existing), after = mini(candidate);
    before.venues[0].races = [old.race]; after.venues[0].races = [next.race];
    try {
      const merged = mergeWithExisting(before, after).payload.venues[0].races[0];
      if (isDeepStrictEqual(merged, old.race)) retained.push({ raceId, previous: structuredClone(old.race), reason: "unchanged or previously confirmed" });
      else normalUpdates.push({ raceId, candidate: structuredClone(merged) });
    } catch (error) {
      if (error.code !== "SETTLED_OFFICIAL_RESULT_CONFLICT") throw error;
      const matching = proofs.filter(proof => `${proof.target.date}:${proof.target.venueCode}:${proof.target.raceNumber}` === raceId);
      assert(matching.length === 1 && verifiedProofs.has(matching[0])
        && isDeepStrictEqual(verifiedProofs.get(matching[0]), matching[0])
        && matching[0].signature === raceResultSignature(next.race), "VERIFIED_CONFLICT_PROOF_REQUIRED");
      assertSameRiders(old.race, next.race);
      quarantined.push({ raceId, previous: structuredClone(old.race), candidate: structuredClone(next.race),
        comparison: error.conflict, proof: matching[0].records.map(({ type, file, sha256, fetchedAt }) => ({ type, file, sha256, fetchedAt })) });
      retained.push({ raceId, previous: structuredClone(old.race), reason: "unresolved official conflict; not a fresh verification" });
    }
  }
  // Deliberately not an official feed: existing today/Review/EX consumers cannot accept this plan as results.
  return { schemaVersion: "official-result-conflict-plan-v1", candidateOnly: true, publicationAllowed: false,
    date: candidate.date, previousSnapshotObjectSha256: digest(JSON.stringify(existing)),
    candidateSnapshotObjectSha256: digest(JSON.stringify(candidate)), normalUpdates, retained, quarantined,
    excludedRaceIds: quarantined.map(row => row.raceId), requiresManualResolution: quarantined.length > 0,
    limitations: ["no public update or settlement is authorized", "future production continuation requires explicit per-race exclusion in downstream consumers"] };
}

export async function writeOfficialConflictPlan(plan, outputDir) {
  assert(plan?.schemaVersion === "official-result-conflict-plan-v1" && plan.candidateOnly === true
    && plan.publicationAllowed === false, "NONPUBLIC_PLAN_REQUIRED");
  const permitted = path.join(repository, ".tmp/official-result-conflicts");
  assert(path.isAbsolute(outputDir), "EXPLICIT_DIAGNOSTIC_DIRECTORY_REQUIRED");
  const parent = await fs.realpath(path.dirname(outputDir));
  const relative = path.relative(permitted, parent);
  assert(relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative)), "DIAGNOSTIC_OUTPUT_ONLY");
  await fs.mkdir(outputDir);
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, "conflict-plan.json"), bytes, { flag: "wx" });
  return { file: path.join(outputDir, "conflict-plan.json"), sha256: digest(bytes), publicationAllowed: false };
}
