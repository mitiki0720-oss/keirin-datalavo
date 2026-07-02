import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const HELPER_PATH = "src/lib/predictionGptSourceContract.ts";
const PAGE_PATH = "src/pages/PageImplementations.tsx";
const REQUIRED_OUTPUT_FIELDS = [
  "date:",
  "venue:",
  "raceNumber:",
  "車番",
  "選手名",
  "登録番号",
  "府県",
  "年齢",
  "期",
  "級班",
  "sourceName:",
  "sourceFetchedAt:",
  "sourceType:",
];
const ALLOWED_SOURCE_TYPES = [
  "official",
  "user-entered-from-official",
  "unknown",
];

function abs(file) {
  return path.isAbsolute(file) ? file : path.resolve(ROOT, file);
}

function print(label, value) {
  console.log(`[${label}]`);
  console.log(JSON.stringify(value, null, 2));
}

export async function auditPredictionPageGptMaterialSourceContract({
  printOutput = true,
} = {}) {
  const failures = [];
  const helper = await readFile(abs(HELPER_PATH), "utf8");
  const page = await readFile(abs(PAGE_PATH), "utf8");
  const fieldPresence = Object.fromEntries(
    REQUIRED_OUTPUT_FIELDS.map((field) => [field, helper.includes(field)]),
  );
  const sourceTypeAllowedValuesPresent = Object.fromEntries(
    ALLOWED_SOURCE_TYPES.map((value) => [
      value,
      helper.includes(`"${value}"`),
    ]),
  );
  const registrationFunctionStart =
    helper.indexOf("const explicitRegistrationNo =");
  const registrationFunctionEnd =
    helper.indexOf("const explicitNullableValue =", registrationFunctionStart);
  const registrationFunction =
    registrationFunctionStart >= 0 && registrationFunctionEnd > registrationFunctionStart
      ? helper.slice(registrationFunctionStart, registrationFunctionEnd)
      : "";
  const registrationNoUsesOnlyExplicitFields = Boolean(
    registrationFunction.includes("rider.registrationNo")
    && registrationFunction.includes("rider.registrationNumber")
    && registrationFunction.includes("rider.registrationId")
    && !/playerId|racerId|athleteId|playerName|\.name/u.test(registrationFunction),
  );
  const missingValuesUseNull = Boolean(
    helper.includes('return "null"')
    && helper.includes("null / null / null / null / null / null / null"),
  );
  const noGeneratedIdentity = Boolean(
    !/padStart|Math\.random|crypto\.randomUUID|generatedRegistration/iu.test(helper),
  );
  const noFuzzyOrNameBasedCompletion = Boolean(
    !/fuzzy|findPlayerCard|matchMethod|normalizePredictionPlayerName/iu.test(helper),
  );
  const pageIntegration = Boolean(
    page.includes("buildPredictionGptMaterialSourceContract")
    && page.includes("exSourceContractText")
    && page.includes("feed: predictionFeed"),
  );

  for (const [field, present] of Object.entries(fieldPresence)) {
    if (!present) failures.push(`GPT material field missing: ${field}`);
  }
  for (const [value, present] of Object.entries(sourceTypeAllowedValuesPresent)) {
    if (!present) failures.push(`sourceType value missing: ${value}`);
  }
  if (!registrationNoUsesOnlyExplicitFields) {
    failures.push("registrationNo is not restricted to explicit registration fields");
  }
  if (!missingValuesUseNull) failures.push("missing values do not use null");
  if (!noGeneratedIdentity) failures.push("generated identity operation detected");
  if (!noFuzzyOrNameBasedCompletion) {
    failures.push("fuzzy or name-based completion detected");
  }
  if (!pageIntegration) failures.push("prediction-page integration is incomplete");

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_AUDIT_FAIL"
    : "PREDICTION_PAGE_GPT_MATERIAL_SOURCE_CONTRACT_AUDIT_COMPLETED";
  const predictionPageGptMaterialSourceContractSummary = {
    requiredFieldCount: REQUIRED_OUTPUT_FIELDS.length,
    presentFieldCount:
      Object.values(fieldPresence).filter(Boolean).length,
    supportedSourceTypes: ALLOWED_SOURCE_TYPES,
    registrationNoUsesOnlyExplicitFields,
    missingValuesUseNull,
    nameBasedRegistrationNoCompletionDetected:
      !noFuzzyOrNameBasedCompletion,
    fakeGeneratedIdentityDetected: !noGeneratedIdentity,
    fuzzyMatchingDetected: !noFuzzyOrNameBasedCompletion,
    publicWritePerformed: false,
    failures,
    finalStatus,
  };
  const predictionPageGptMaterialSourceContractRecord = {
    helperPath: HELPER_PATH,
    pagePath: PAGE_PATH,
    blockHeaderPresent: helper.includes("【EX source contract】"),
    starterTableHeaderPresent: helper.includes("【出走表】"),
    fieldPresence,
    sourceTypeAllowedValuesPresent,
    pageIntegration,
  };
  const result = {
    predictionPageGptMaterialSourceContractSummary,
    predictionPageGptMaterialSourceContractRecord,
  };
  if (printOutput) {
    print(
      "predictionPageGptMaterialSourceContractSummary",
      predictionPageGptMaterialSourceContractSummary,
    );
    print(
      "predictionPageGptMaterialSourceContractRecord",
      predictionPageGptMaterialSourceContractRecord,
    );
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditPredictionPageGptMaterialSourceContract();
