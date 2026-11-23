import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import { createOfficialConflictProof, verifyStoredOfficialConflict } from "./plan-official-result-conflict-isolation.mjs";
import { describeSettledResultConflict, raceResultSignature } from "./update-keirin-jp-results.mjs";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, code) => { if (!condition) throw new Error(code); };
const validDate = date => /^\d{4}-\d{2}-\d{2}$/u.test(date ?? "") && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const forbidden = /(?:authorization|set-cookie|cookie|password|access[_-]?token|refresh[_-]?token|api[_-]?key|email|phone|address|birth(?:day|date))/iu;
const secretText = /\b(?:Bearer\s+[A-Za-z0-9._-]+|gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+)|(?:authorization|cookie)\s*[:=]|[?&](?:access_token|token|api_key|auth)=|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b0\d{1,4}-\d{1,4}-\d{3,4}\b/iu;

function scanSensitive(value) {
  if (typeof value === "string") assert(!secretText.test(value), "SENSITIVE_CONTENT_REJECTED");
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert(!forbidden.test(key), "SENSITIVE_FIELD_REJECTED");
    scanSensitive(child);
  }
}

function publicSignature(race) {
  const signature = JSON.parse(raceResultSignature(race));
  signature.finishOrder = signature.finishOrder?.map(({ name: _name, registrationNo: _registrationNo, ...row }) => row);
  return signature;
}

function select(object, keys) {
  return Object.fromEntries(keys.filter(key => object?.[key] !== undefined).map(key => [key, object[key]]));
}

function redactKnownPlayers(value, rows) {
  const privateValues = new Set(rows.flatMap(row => [row.name, row.registrationNo]).filter(Boolean)
    .flatMap(text => [String(text), String(text).normalize("NFKC"), String(text).normalize("NFKC").replace(/\s/gu, "")]));
  const visit = item => {
    if (typeof item === "string") {
      let text = item;
      for (const token of privateValues) text = text.split(token).join("[PLAYER_REDACTED]");
      return text.replace(/\d{1,3}歳/gu, "[AGE_REDACTED]");
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, visit(child)]));
    return item;
  };
  return visit(value);
}

function redactedResponse(type, value, raceNumber) {
  const payoutKeys = ["WH2HaraiGakuDispItemSubData", "WT2HaraiGakuDispItemSubData", "SH2HaraiGakuDispItemSubData", "ST2HaraiGakuDispItemSubData", "RH3HaraiGakuDispItemSubData", "RT3HaraiGakuDispItemSubData", "WHaraiGakuDispItemSubData"];
  if (type === "JSJ012") return {
    ...select(value, ["resultCd", "lastUpdateTime", "tyakujyunDispFlg", "haraiGakuDispFlg", "tenki", "husoku"]),
    tyakujyunItemSubData: (value.tyakujyunItemSubData ?? []).map(row => ({
      ...select(row, ["tyaku", "syaban", "BH", "kimarite", "tyakusa", "agari", "kojinState", "tyakuNote"]),
      ...(Array.isArray(row.kojinStateItemSubData) ? { kojinStateItemSubData: row.kojinStateItemSubData.map(item => select(item, ["kojinState", "tyakuNote"])) } : {}),
    })),
    haraiGakuSubData: Object.fromEntries(payoutKeys.filter(key => Array.isArray(value.haraiGakuSubData?.[key]))
      .map(key => [key, value.haraiGakuSubData[key].map(row => select(row, ["kumiBan", "haraiGaku", "ninki", "kumiDispFlg", "ninkiDispFlg"]))])),
  };
  if (type === "JSJ006") return {
    ...select(value, ["resultCd", "bKeirinjyoCd", "lastUpdateTime", "syusouInfoExistFlg"]),
    sensyuTypeInfo: (value.sensyuTypeInfo ?? []).map(row => select(row, ["syaban"])),
  };
  const header = value.C0201data;
  return { resultCd: value.resultCd, C0201data: {
    ...select(header, ["selKaisai", "selKjyoCd", "selRaceNo", "flgRaceCancel", "flgSectionCancel"]),
    selectedRace: select(header?.C0201race?.[raceNumber - 1], ["flgRaceEnd", "rcvKekka", "rcvRefund"]),
    C0201racedtl: { ...select(header?.C0201racedtl, ["syumoku", "kyori", "syukai", "aftStartTime", "aftBetTime"]),
      C0201sensyu: (header?.C0201racedtl?.C0201sensyu ?? []).map(row => select(row, ["carNum"])) },
  } };
}

function knownRace(snapshot, target) {
  assert(snapshot?.date === target.date && snapshot.source?.provider === "KEIRIN.JP", "STORED_SNAPSHOT_DATE_OR_SOURCE_MISMATCH");
  const venues = snapshot.venues?.filter(venue => venue.date === target.date && String(venue.venueCode) === target.venueCode) ?? [];
  const races = venues.length === 1 ? venues[0].races.filter(race => race.raceNumber === target.raceNumber) : [];
  assert(races.length === 1, "STORED_RACE_IDENTITY_MISSING");
  return races[0];
}

export async function prepareOfficialConflictArtifact({ targetDate, priorJobStatus = "success", runStartedAt, sourceRoot = path.join(repository, ".tmp/official-result-conflicts"),
  snapshotFile = path.join(repository, "public/data/races/keirin-jp-results.generated.json"), runnerTemp = process.env.RUNNER_TEMP,
  repositoryRetentionDays = process.env.GITHUB_RETENTION_DAYS, retentionDays = 7 } = {}) {
  assert(validDate(targetDate), "INVALID_TARGET_DATE");
  assert(Number.isFinite(Date.parse(runStartedAt)) && Date.parse(runStartedAt) <= Date.now() + 120000, "RUN_START_TIME_REQUIRED");
  assert(retentionDays === 7, "RETENTION_MUST_BE_SEVEN_DAYS");
  const maximum = Number(repositoryRetentionDays);
  assert(Number.isInteger(maximum) && maximum >= 7, "REPOSITORY_RETENTION_LIMIT_UNVERIFIED_OR_TOO_SHORT");
  assert(["success", "failure", "cancelled", "skipped"].includes(priorJobStatus), "INVALID_PRIOR_JOB_STATUS");
  const sourceDir = path.resolve(sourceRoot, targetDate);
  const sourceStat = await fs.lstat(sourceDir).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  assert(!sourceStat?.isSymbolicLink(), "SYMLINK_EVIDENCE_REJECTED");
  const entries = sourceStat ? await fs.readdir(sourceDir, { withFileTypes: true }) : [];
  const candidates = entries.filter(entry => /^[a-f0-9]{64}\.json$/u.test(entry.name));
  assert(candidates.length <= 500, "EXCESSIVE_EVIDENCE_FILE_COUNT");
  const snapshotBytes = await fs.readFile(snapshotFile);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8"));
  const freshExpected = snapshot.date === targetDate ? snapshot.venues?.flatMap(venue => (venue.races ?? []).filter(race => {
    const marker = race.officialResultConflict;
    return marker && Date.parse(marker.lastObservedAt) >= Date.parse(runStartedAt);
  }).map(race => race.officialResultConflict.lastEvidenceBundleSha256)) ?? [] : [];
  for (const hash of freshExpected) assert(candidates.some(entry => entry.name === `${hash}.json`), "REQUIRED_CONFLICT_EVIDENCE_MISSING");
  const prepared = [];
  for (const entry of candidates.sort((a,b) => a.name.localeCompare(b.name))) {
    assert(entry.isFile() && !entry.isSymbolicLink(), "NONREGULAR_EVIDENCE_REJECTED");
    const file = path.join(sourceDir, entry.name), stat = await fs.lstat(file);
    assert(!stat.isSymbolicLink() && stat.size <= 5 * 1024 * 1024, "UNSAFE_EVIDENCE_FILE");
    const bytes = await fs.readFile(file), bundleSha256 = sha(bytes);
    assert(entry.name === `${bundleSha256}.json`, "EVIDENCE_FILENAME_SHA_MISMATCH");
    const bundle = JSON.parse(bytes.toString("utf8"));
    assert(bundle.schemaVersion === "official-conflict-evidence-v1" && bundle.target?.date === targetDate && Array.isArray(bundle.records), "INVALID_CONFLICT_BUNDLE");
    scanSensitive(Object.fromEntries(Object.entries(bundle).filter(([key]) => key !== "records")));
    const target = { date: bundle.target.date, venueCode: bundle.target.venueCode, raceNumber: bundle.target.raceNumber };
    if (bundle.records.length && bundle.records.every(record => Number.isFinite(Date.parse(record.fetchedAt)) && Date.parse(record.fetchedAt) < Date.parse(runStartedAt))) continue;
    const raw = {};
    for (const record of bundle.records) {
      scanSensitive(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "bodyBase64")));
      assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(record.fetchedAt), "INVALID_ACQUISITION_TIMESTAMP");
      const body = Buffer.from(record.bodyBase64, "base64");
      assert(sha(body) === record.sha256, "ORIGINAL_RESPONSE_SHA_MISMATCH");
      const json = JSON.parse(body.toString("utf8")); scanSensitive(json);
      scanSensitive({ url: record.url, finalUrl: record.finalUrl });
      raw[record.type] = json;
    }
    const proof = createOfficialConflictProof(target, raw, bundle.records);
    const storedRace = knownRace(snapshot, target);
    const raceId = `${targetDate}:${target.venueCode}:${target.raceNumber}`;
    if (storedRace.officialResultConflict) verifyStoredOfficialConflict(storedRace, raceId);
    const previous = storedRace.officialResultConflict?.previous ?? storedRace;
    assert(previous.resultStatus === "confirmed", "PREVIOUS_CONFIRMED_RESULT_REQUIRED");
    const comparison = describeSettledResultConflict(raceId, previous, proof.result);
    if (!comparison.changedFields.length) continue;
    const oldRiders = new Map(previous.finishOrder.map(row => [row.carNo, row]));
    assert(oldRiders.size === proof.result.finishOrder.length && proof.result.finishOrder.every(row => {
      const old = oldRiders.get(row.carNo);
      return old && old.registrationNo === row.registrationNo && old.name.normalize("NFKC").replace(/\s/gu, "") === row.name.normalize("NFKC").replace(/\s/gu, "");
    }), "PREVIOUS_RESULT_RIDER_IDENTITY_MISMATCH");
    const projected = bundle.records.map(record => {
      const data = redactedResponse(record.type, raw[record.type], bundle.target.raceNumber);
      scanSensitive(data);
        return { apiType: record.type, source: `https://keirin.jp/pc/json?type=${record.type}`, status: record.status,
        fetchedAt: record.fetchedAt, originalSha256: record.sha256, redactedSha256: sha(JSON.stringify(data)), data };
    });
    const document = { schemaVersion: "redacted-official-conflict-artifact-v1", raceId, target,
      state: storedRace.officialResultConflict?.status ?? "unresolved", changedFields: comparison.changedFields,
      previousSignatureSha256: sha(raceResultSignature(previous)), candidateSignatureSha256: sha(proof.signature),
      previous: publicSignature(previous), candidate: publicSignature(proof.result),
      storedSnapshotFetchedAt: snapshot.source?.fetchCompletedAt ?? null,
      previousResultAcquisitionTime: "not independently recorded; no inferred timestamp",
      originalBundleSha256: bundleSha256, storedSnapshotAtPackagingSha256: sha(snapshotBytes),
      identityValidation: "original inputs validated before redaction; names and registration numbers not exported",
      rawResponses: projected, redaction: { removed: ["player names", "registration numbers", "ages", "profile fields", "internal request parameters"], originalRestorable: false } };
    const identityRows = [...previous.finishOrder, ...proof.result.finishOrder];
    document.previous = redactKnownPlayers(document.previous, identityRows);
    document.candidate = redactKnownPlayers(document.candidate, identityRows);
    for (const response of document.rawResponses) {
      response.data = redactKnownPlayers(response.data, identityRows);
      response.redactedSha256 = sha(JSON.stringify(response.data));
    }
    scanSensitive(document);
    const text = JSON.stringify(document, null, 2) + "\n";
    assert(!/"(?:name|sensyuName|registrationNo|sensyuRegistNo|numPlayer|namePlayerSei|age|huKen|bodyBase64)"\s*:/u.test(text), "PERSONAL_FIELD_EXPORT_REJECTED");
    prepared.push({ name: `${targetDate}-${bundle.target.venueCode}-${bundle.target.raceNumber}-${bundleSha256}.json`, text, raceId });
  }
  if (!prepared.length) return { hasEvidence: false, fileCount: 0, files: [], status: priorJobStatus === "success" ? "NO_NEW_CONFLICT_EVIDENCE" : "UPSTREAM_FAILED_WITHOUT_CONFLICT_EVIDENCE", retentionDays };
  assert(typeof runnerTemp === "string" && runnerTemp && !/[\r\n]/u.test(runnerTemp), "RUNNER_TEMP_REQUIRED");
  const outsidePublic = directory => { const relative = path.relative(path.join(repository, "public"), path.resolve(directory)); return relative.startsWith("..") || path.isAbsolute(relative); };
  assert(outsidePublic(runnerTemp), "PUBLIC_ARTIFACT_STAGING_PROHIBITED");
  await fs.mkdir(runnerTemp, { recursive: true });
  assert(outsidePublic(await fs.realpath(runnerTemp)), "PUBLIC_ARTIFACT_STAGING_PROHIBITED");
  const directory = await fs.mkdtemp(path.join(runnerTemp, "official-conflict-artifact-"));
  const files = [], inventory = [];
  for (const item of prepared) {
    const file = path.join(directory, item.name); await fs.writeFile(file, item.text, { flag: "wx", mode: 0o600 });
    files.push(file); inventory.push({ file: item.name, raceId: item.raceId, sha256: sha(item.text) });
  }
  const manifest = { schemaVersion: "redacted-official-conflict-artifact-manifest-v1", targetDate, retentionDays,
    priorJobStatus, redacted: true, originalsIncluded: false, originalsRestorable: false, files: inventory };
  const manifestFile = path.join(directory, "manifest.json");
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  files.push(manifestFile);
  return { hasEvidence: true, status: "PREPARED_UPLOAD_REQUIRED", fileCount: files.length, files, directory, raceIds: [...new Set(prepared.map(row => row.raceId))], retentionDays };
}

async function main() {
  const result = await prepareOfficialConflictArtifact({ targetDate: process.env.CONFLICT_TARGET_DATE,
    priorJobStatus: process.env.CONFLICT_PRIOR_JOB_STATUS || "success", runStartedAt: process.env.CONFLICT_RUN_STARTED_AT,
    retentionDays: Number(process.env.CONFLICT_RETENTION_DAYS || 7) });
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `FILES_${randomUUID().replaceAll("-", "")}`;
    await fs.appendFile(process.env.GITHUB_OUTPUT, `has_evidence=${result.hasEvidence}\nfiles<<${delimiter}\n${result.files.join("\n")}\n${delimiter}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `\nOfficial conflict evidence: ${result.status}; files=${result.fileCount}; retention=7 days; personal fields removed; original JSON not reconstructible.\n`);
  if (result.status === "UPSTREAM_FAILED_WITHOUT_CONFLICT_EVIDENCE") console.warn("::warning::Upstream update failed; no acquired conflict evidence was available. This is not a successful recovery.");
  console.log(JSON.stringify({ status: result.status, fileCount: result.fileCount, raceIds: result.raceIds ?? [], retentionDays: result.retentionDays }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(async error => {
  const code = /^[A-Z0-9_]+$/u.test(error.message) ? error.message : "ARTIFACT_PREPARATION_FAILED";
  console.error(`::error::Official conflict evidence was not uploaded: ${code}`);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `\nOfficial conflict evidence: FAILED (${code}); artifact upload is blocked.\n`);
  process.exitCode = 1;
});
