import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const HELPER_PATH = "src/lib/predictionGptSourceContract.ts";
const PAGE_PATH = "src/pages/PageImplementations.tsx";

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditPredictionPageGptMaterialRegistrationNoEnrichment({
  printOutput = true,
} = {}) {
  const failures = [];
  const helper = await readFile(abs(HELPER_PATH), "utf8");
  const page = await readFile(abs(PAGE_PATH), "utf8");
  const requiredSourceValues = [
    "entry",
    "kurari-ex-rider-exact",
    "kurari-ex-rider-identity",
    "none",
  ];
  const requiredStatusValues = [
    "explicit-entry-registration",
    "safe-identity-match",
    "unavailable",
    "ambiguous-blocked",
    "conflict-blocked",
  ];
  const explicitPriorityPresent = Boolean(
    helper.indexOf("const explicit = explicitRegistrationNo(rider)")
      < helper.indexOf("const sameNameCandidates = candidates.filter"),
  );
  const explicitEntryFieldsPresent = [
    "rider.registrationNo",
    "rider.registration",
    "rider.registrationNumber",
    "rider.registrationId",
  ].every((field) => helper.includes(field));
  const safeMatchConditionsPresent = [
    "normalizeIdentityText(candidate.playerName) === playerName",
    "candidatePrefecture !== riderPrefecture",
    "candidateTerm !== riderTerm",
    "candidateClass !== riderClass",
    "distinctNameRegistrationNos.size > 1",
    "candidate.sameNameCandidate",
    "candidate.ambiguous",
    "candidate.fuzzyMatched",
  ].every((condition) => helper.includes(condition));
  const ambiguousBlocked = Boolean(
    helper.includes('status: "ambiguous-blocked"')
    && helper.includes("safeRegistrationNos.size > 1"),
  );
  const unavailableRemainsNull = Boolean(
    helper.includes(
      'return { registrationNo: "null", source: "none", status: "unavailable" }',
    ),
  );
  const conflictRemainsNull = Boolean(
    helper.includes('status: conflictDetected ? "conflict-blocked" : "unavailable"'),
  );
  const noFuzzyMatching = Boolean(
    !/levenshtein|similarity|fuse\./iu.test(helper)
    && helper.includes("candidate.fuzzyMatched"),
  );
  const noNameOnlyCompletion = Boolean(
    safeMatchConditionsPresent
    && helper.includes("!riderPrefecture")
    && helper.includes("!riderTerm"),
  );
  const noGeneratedRegistrationNo =
    !/padStart|Math\.random|randomUUID|generatedRegistration/iu.test(helper);
  const sourceColumnsPresent = Boolean(
    helper.includes("登録番号source")
    && helper.includes("登録番号status"),
  );
  const sourceValuesPresent =
    requiredSourceValues.every((value) => helper.includes(`"${value}"`));
  const statusValuesPresent =
    requiredStatusValues.every((value) => helper.includes(`"${value}"`));
  const trustedIdentityLoaderPresent = Boolean(
    page.includes("PREDICTION_REGISTRATION_IDENTITY_SOURCE_INDEX_URL")
    && page.includes('source.checkStatus === "PASS"')
    && page.includes("document.sourceSnapshotHash !== source.sourceSnapshotHash")
    && page.includes("document.quality?.fakeCompletionPerformed")
    && page.includes("document.quality?.fuzzyMatchingPerformed")
    && page.includes(
      'starter.registrationNoSource === "entries-history-snapshot"',
    ),
  );
  const candidatesPassedToMaterial = Boolean(
    page.includes(
      "registrationCandidates: selectedPredictionRegistrationCandidates",
    ),
  );

  const checks = {
    sourceColumnsPresent,
    sourceValuesPresent,
    statusValuesPresent,
    explicitPriorityPresent,
    explicitEntryFieldsPresent,
    safeMatchConditionsPresent,
    noNameOnlyCompletion,
    noFuzzyMatching,
    ambiguousBlocked,
    unavailableRemainsNull,
    conflictRemainsNull,
    noGeneratedRegistrationNo,
    trustedIdentityLoaderPresent,
    candidatesPassedToMaterial,
  };
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) failures.push(`enrichment check failed: ${name}`);
  }

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_AUDIT_FAIL"
    : "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_ENRICHMENT_AUDIT_COMPLETED";
  const predictionPageGptMaterialRegistrationNoEnrichmentSummary = {
    registrationNoSourceValues: requiredSourceValues,
    registrationNoTrustStatusValues: requiredStatusValues,
    explicitEntryRegistrationHasPriority: explicitPriorityPresent,
    safeIdentityMatchOnly: safeMatchConditionsPresent,
    nameOnlyCompletionDetected: !noNameOnlyCompletion,
    fuzzyMatchingDetected: !noFuzzyMatching,
    generatedRegistrationNoDetected: !noGeneratedRegistrationNo,
    ambiguousCandidatesBlocked: ambiguousBlocked,
    unavailableRemainsNull,
    publicWritePerformed: false,
    failures,
    finalStatus,
  };
  const result = {
    predictionPageGptMaterialRegistrationNoEnrichmentSummary,
    predictionPageGptMaterialRegistrationNoEnrichmentRecord: {
      helperPath: HELPER_PATH,
      pagePath: PAGE_PATH,
      checks,
    },
  };
  if (printOutput) {
    print(
      "predictionPageGptMaterialRegistrationNoEnrichmentSummary",
      predictionPageGptMaterialRegistrationNoEnrichmentSummary,
    );
    print(
      "predictionPageGptMaterialRegistrationNoEnrichmentRecord",
      result.predictionPageGptMaterialRegistrationNoEnrichmentRecord,
    );
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditPredictionPageGptMaterialRegistrationNoEnrichment();
