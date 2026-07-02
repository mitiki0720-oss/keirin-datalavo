import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const HELPER_PATH = "src/lib/reviewResultOutputContract.ts";
const PAGE_PATH = "src/pages/ReviewPage.tsx";
const DOC_PATH = "docs/kurari-ex/review-page-result-output-implementation.md";

const abs = (file) => path.isAbsolute(file) ? file : path.resolve(ROOT, file);

export async function auditReviewPageResultOutputContract({
  printOutput = true,
} = {}) {
  const failures = [];
  const [helper, page, doc] = await Promise.all([
    readFile(abs(HELPER_PATH), "utf8"),
    readFile(abs(PAGE_PATH), "utf8"),
    readFile(abs(DOC_PATH), "utf8"),
  ]);
  const requiredPayloadFields = [
    "date",
    "venueName",
    "raceNumber",
    "raceStatus",
    "finishOrder",
    "rank",
    "carNo",
    "playerName",
    "registrationNo",
    "registrationNoSource",
    "registrationNoTrustStatus",
    "payout",
    "twoExact",
    "twoQuinella",
    "threeExact",
    "threeQuinella",
    "wide",
    "officialResultSource",
    "sourceFetchedAt",
    "sourceHash",
    "linkedPredictionFile",
    "linkedSummaryFile",
    "linkedReviewFile",
  ];
  const requiredStatuses = [
    "finished",
    "cancelled",
    "postponed",
    "unknown",
  ];
  const explicitResultIndex = helper.indexOf(
    "const explicit = explicitResultRegistration(finish)",
  );
  const entryLookupIndex = helper.indexOf(
    "const carEntries = entries.filter",
  );
  const checks = {
    markerDefined: helper.includes(
      '"KURARI_EX_RESULT_OUTPUT_V1"',
    ),
    markerIntegrated: page.includes(
      "buildKurariExResultOutputBlock({",
    ),
    requiredPayloadFieldsPresent: requiredPayloadFields.every(
      (field) => helper.includes(field),
    ),
    raceStatusesPresent: requiredStatuses.every(
      (status) => helper.includes(`"${status}"`)
        || page.includes(`"${status}"`),
    ),
    explicitResultRegistrationFirst:
      explicitResultIndex >= 0
      && entryLookupIndex > explicitResultIndex,
    safeEntryJoinUsesCarNoAndExactName:
      helper.includes("nullableText(entry.carNo) === carNo")
      && helper.includes("entryName !== playerName")
      && helper.includes("carEntries.length > 1"),
    missingRegistrationRemainsNull:
      helper.includes("registrationNo: null")
      && helper.includes('registrationNoSource: "none"')
      && helper.includes('registrationNoTrustStatus: "unavailable"'),
    ambiguousAndConflictBlocked:
      helper.includes('"ambiguous-blocked"')
      && helper.includes('"conflict-blocked"'),
    noNameOnlyLookup:
      helper.includes("Same-race carNo is the primary join key")
      && !/entries\.filter\([^)]*(?:playerName|name)/su.test(helper),
    noFuzzyMatching:
      !/levenshtein|similarity|fuse\.|fuzzyMatch/iu.test(helper),
    noGeneratedRegistrationNo:
      !/padStart|Math\.random|randomUUID|generatedRegistration/iu.test(helper),
    noResultProseStarterSource:
      !/result(?:Text|Note|Prose).*(?:starter|rider|entry)/isu.test(helper),
    structuredSourceOnly:
      page.includes("race.feedRace?.result?.officialResultSource")
      && page.includes("race.feedRace?.result?.sourceHash"),
    linksIntegrated:
      page.includes("linkedPredictionFile: selectedReviewFileGroup?.predictionFile")
      && page.includes("linkedSummaryFile: selectedReviewFileGroup?.summaryFile")
      && page.includes("linkedReviewFile: selectedReviewFileGroup?.resultFile"),
    documentationIncludesExample:
      doc.includes("KURARI_EX_RESULT_OUTPUT_V1")
      && doc.includes('"finishOrder"')
      && doc.includes('"source"')
      && doc.includes('"links"'),
  };

  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) failures.push(`result output contract check failed: ${name}`);
  }

  const finalStatus = failures.length
    ? "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_AUDIT_FAIL"
    : "REVIEW_PAGE_RESULT_OUTPUT_CONTRACT_AUDIT_COMPLETED";
  const reviewPageResultOutputSummary = {
    marker: "KURARI_EX_RESULT_OUTPUT_V1",
    requiredPayloadFields,
    registrationNoPriority: [
      "explicit structured result registration",
      "same-race carNo plus exact playerName entry/prediction material",
      "null",
    ],
    nameOnlyCompletionDetected: !checks.noNameOnlyLookup,
    fuzzyMatchingDetected: !checks.noFuzzyMatching,
    generatedRegistrationNoDetected: !checks.noGeneratedRegistrationNo,
    publicWritePerformed: false,
    failures,
    finalStatus,
  };
  const result = {
    reviewPageResultOutputSummary,
    reviewPageResultOutputRecord: {
      helperPath: HELPER_PATH,
      pagePath: PAGE_PATH,
      docPath: DOC_PATH,
      checks,
    },
  };

  if (printOutput) {
    console.log(JSON.stringify(result, null, 2));
    console.log(finalStatus);
    if (failures.length) process.exitCode = 1;
  }
  return result;
}

const isMain =
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await auditReviewPageResultOutputContract();

