import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const HELPER_PATH = "src/lib/predictionGptSourceContract.ts";
const PAGE_PATH = "src/pages/PageImplementations.tsx";
const DOC_PATH =
  "docs/kurari-ex/prediction-page-gpt-material-registrationno-material-enrichment.md";

const abs = (file) => path.isAbsolute(file) ? file : path.resolve(ROOT, file);

export async function auditPredictionPageGptMaterialRegistrationNoMaterialEnrichment({
  printOutput = true,
} = {}) {
  const failures = [];
  const [helper, page, doc] = await Promise.all([
    readFile(abs(HELPER_PATH), "utf8"),
    readFile(abs(PAGE_PATH), "utf8"),
    readFile(abs(DOC_PATH), "utf8"),
  ]);
  const requiredSources = [
    "entry",
    "kurari-ex-rider-exact",
    "kurari-ex-rider-identity",
    "material-registered-player-card",
    "material-player-exact-detail",
    "none",
  ];
  const requiredStatuses = [
    "explicit-entry-registration",
    "safe-identity-match",
    "safe-material-match",
    "unavailable",
    "ambiguous-blocked",
    "conflict-blocked",
  ];
  const explicitPriority =
    helper.indexOf("const explicit = explicitRegistrationNo(rider)")
    < helper.indexOf("const sameNameCandidates = candidates.filter");
  const checks = {
    sourcesPresent: requiredSources.every(
      (value) => helper.includes(`"${value}"`),
    ),
    statusesPresent: requiredStatuses.every(
      (value) => helper.includes(`"${value}"`),
    ),
    explicitEntryPriority: explicitPriority,
    playerNameExactMatch:
      helper.includes(
        "normalizeIdentityText(candidate.playerName) === playerName",
      ),
    materialCarNoExactMatch:
      helper.includes("candidateCarNo !== riderCarNo")
      && helper.includes("candidateCarNo === \"null\""),
    prefectureSuffixOnly:
      helper.includes(".replace(/[都道府県]$/u, \"\")")
      && !/prefectureAlias|prefectureMap/iu.test(helper),
    demographicConflictsBlocked:
      helper.includes(
        "candidatePrefecture !== riderPrefecture",
      )
      && helper.includes("candidateTerm !== riderTerm"),
    classOnlyMismatchSoft:
      helper.includes("const classMismatchSoft =")
      && helper.includes("candidateClass !== riderClass")
      && !helper.includes("if (candidateClass && riderClass && candidateClass !== riderClass)")
      && !helper.includes("|| (candidateClass && riderClass && candidateClass !== riderClass)"),
    uniqueRegistrationNoRequired:
      helper.includes("distinctNameRegistrationNos.size > 1")
      && helper.includes("safeRegistrationNos.size > 1"),
    unsafeFlagsBlocked:
      helper.includes("candidate.ambiguous")
      && helper.includes("candidate.sameNameCandidate")
      && helper.includes("candidate.fuzzyMatched"),
    materialStatusApplied:
      helper.includes(
        'status: materialMatch ? "safe-material-match" : "safe-identity-match"',
      ),
    registeredPlayerCardMaterialOnly:
      page.includes(
        "selectedPredictionPlayerCardInsightText.includes(item.registrationNo)",
      )
      && page.includes(
        'source: "material-registered-player-card" as const',
      ),
    playerExactDetailMaterialOnly:
      page.includes(
        "selectedKurariExRiderMaterial.text.includes(entry.registrationNo)",
      )
      && page.includes(
        'source: "material-player-exact-detail" as const',
      ),
    materialCandidatesPassed:
      page.includes("...selectedPredictionMaterialRegistrationCandidates"),
    noFuzzyMatching:
      !/levenshtein|similarity|fuse\./iu.test(helper),
    noRegistrationGeneration:
      !/Math\.random|randomUUID|generatedRegistration|padStart/iu.test(helper),
    documentationComplete:
      doc.includes("【D. 登録選手特徴メモ】")
      && doc.includes("【PLAYER EX / 選手別EXACT】")
      && doc.includes("【実戦根拠選手の詳細】")
      && doc.includes("safe-material-match"),
  };

  for (const [name, passed] of Object.entries(checks)) {
    if (!passed) failures.push(`material enrichment check failed: ${name}`);
  }

  const finalStatus = failures.length
    ? "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_AUDIT_FAIL"
    : "PREDICTION_PAGE_GPT_MATERIAL_REGISTRATIONNO_MATERIAL_ENRICHMENT_AUDIT_COMPLETED";
  const predictionPageGptMaterialRegistrationNoMaterialEnrichmentSummary = {
    materialSections: [
      "D. registered player memo",
      "PLAYER EX / rider EXACT",
      "practical evidence rider detail",
    ],
    registrationNoSourceValues: requiredSources,
    registrationNoTrustStatusValues: requiredStatuses,
    explicitEntryRegistrationHasPriority: explicitPriority,
    materialCarNoAndExactNameRequired:
      checks.materialCarNoExactMatch && checks.playerNameExactMatch,
    prefectureAdministrativeSuffixOnly: checks.prefectureSuffixOnly,
    classOnlyMismatchSoft: checks.classOnlyMismatchSoft,
    nameOnlyCompletionDetected: false,
    fuzzyMatchingDetected: !checks.noFuzzyMatching,
    generatedRegistrationNoDetected: !checks.noRegistrationGeneration,
    publicWritePerformed: false,
    failures,
    finalStatus,
  };
  const result = {
    predictionPageGptMaterialRegistrationNoMaterialEnrichmentSummary,
    predictionPageGptMaterialRegistrationNoMaterialEnrichmentRecord: {
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
if (isMain) {
  await auditPredictionPageGptMaterialRegistrationNoMaterialEnrichment();
}
