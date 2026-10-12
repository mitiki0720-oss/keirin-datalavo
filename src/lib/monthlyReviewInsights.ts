import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";
export const MONTHLY_TICKET_POLICY_VERSION = "v2026-10";
export const MONTHLY_TICKET_MODE = "ABC_8_TO_14_SHADOW_VALUE_TRIFECTA";
export const MONTHLY_RECOMMENDED_POINTS = 8;
export const MONTHLY_INVESTMENT_YEN = 800;
export const MONTHLY_CANDIDATE_COUNT = 18;
export const MONTHLY_TICKET_REASON_TAGS = [
  "monthly-review-october-rule",
  "abc-race-selection",
  "base-8",
  "max-14",
  "shadow-18-audit",
  "head-candidates-2-to-4",
  "second-third-correction",
  "shadow-value-upgrade-by-replacement",
] as const;

const FALLBACK_DIGEST: MonthlyReviewDigest = {
  stableCohort: "2026-09-02〜2026-09-30（直接照合対象）",
  hitRateAny: "監査レポート参照",
  hitRate3tan: "監査レポート参照",
  hitRate2tan: "10月運用では新規購入対象外",
  thirdOnlyMiss: "9月 502R",
  headMiss: "A候補は頭2人以内を検査",
  targetHitRateAny: "未達目標 65〜70%",
  targetHitRate3tan: "未設定",
  targetHitRate2tan: "原則購入対象外",
  targetRecoveryRate: "事前オッズと購入採算を確認",
  targetThirdOnlyMiss: "9月の3着だけ抜け 502R",
  fixedFormat: "A 8〜10点 / B 10〜14点 / C 0点 / 影18候補 / 1点100円",
  mission: "A選別を厳格化し、本線1・2着からの3着接続と影VALUE入れ替えの根拠を残す",
  rawText: "",
};

export type MonthlyPreRaceSeed = {
  metaStatus: "PRE_RACE_SEED";
  ruleVersion: typeof MONTHLY_TICKET_POLICY_VERSION;
  ticketMode: typeof MONTHLY_TICKET_MODE;
  candidateCount: typeof MONTHLY_CANDIDATE_COUNT;
  lineupGroupCount: number;
  raceSelectGradeSeed: "A" | "B" | "C";
  purchaseDecisionSeed: "BUY" | "VALUE_BUY" | "SKIP";
  purchasePointsSeed: 0 | 8 | 10;
  investmentYenSeed: 0 | 800 | 1000;
  reasonCodes: string[];
  finalizationRequired: true;
};

const normalizeLineupGroup = (value: string) => value
  .normalize("NFKC")
  .replace(/[→⇒＞>]/gu, "-")
  .replace(/[‐‑‒–—―ー−]/gu, "-")
  .replace(/\s+/gu, "")
  .trim();

export function countMonthlyLineupGroups(lineup: string): number {
  const normalized = String(lineup ?? "")
    .normalize("NFKC")
    .replace(/^並び\s*[:：]\s*/u, "")
    .trim();
  if (!normalized || /未取得|未掲載|並びなし|並び無し|^(?:なし|無し)$/u.test(normalized)) return 0;

  const groups = normalized
    .split(/[\/／|｜]/u)
    .map(normalizeLineupGroup)
    .filter(Boolean);
  if (groups.length === 0 || groups.some((group) => !/^[1-9](?:-[1-9])*$/u.test(group))) return 0;

  const cars = groups.flatMap((group) => group.split("-"));
  if (new Set(cars).size !== cars.length) return 0;
  return groups.length;
}

export function buildMonthlyPreRaceSeed({
  lineup = "",
  raceTitle = "",
  gradeLabel = "",
  isCancelled = false,
  monthlyReviewAvailable = true,
}: {
  lineup?: string;
  raceTitle?: string;
  gradeLabel?: string;
  isCancelled?: boolean;
  monthlyReviewAvailable?: boolean;
}): MonthlyPreRaceSeed {
  const lineupGroupCount = countMonthlyLineupGroups(lineup);
  const sourceText = `${gradeLabel} ${raceTitle}`.normalize("NFKC");
  const reasonCodes: string[] = [];

  if (!monthlyReviewAvailable) reasonCodes.push("monthly-review-unavailable");
  if (isCancelled) reasonCodes.push("cancelled");
  if (lineupGroupCount === 0) reasonCodes.push("lineup-missing");
  if (lineupGroupCount === 1) reasonCodes.push("lineup-structure-undetermined");

  if (reasonCodes.length > 0) {
    return {
      metaStatus: "PRE_RACE_SEED",
      ruleVersion: MONTHLY_TICKET_POLICY_VERSION,
      ticketMode: MONTHLY_TICKET_MODE,
      candidateCount: MONTHLY_CANDIDATE_COUNT,
      lineupGroupCount,
      raceSelectGradeSeed: "C",
      purchaseDecisionSeed: "SKIP",
      purchasePointsSeed: 0,
      investmentYenSeed: 0,
      reasonCodes,
      finalizationRequired: true,
    };
  }

  if (lineupGroupCount >= 4) reasonCodes.push("multi-line-4plus");
  if (/\b(?:GP|G1|GI|G2|GII|G3|GIII)\b/iu.test(sourceText)) reasonCodes.push("s-or-graded-race");
  if (/S級/iu.test(sourceText) && !reasonCodes.includes("s-or-graded-race")) reasonCodes.push("s-or-graded-race");
  if (/新人|アドバンス|男ア|ガールズ新人|ガールズ/iu.test(sourceText)) reasonCodes.push("structure-recheck-required");

  const valueSeed = reasonCodes.length > 0;
  if (!valueSeed) reasonCodes.push("lineup-structured");
  if (!valueSeed) reasonCodes.push("a-confidence-unverified");
  const purchasePointsSeed = valueSeed ? 10 : 8;

  return {
    metaStatus: "PRE_RACE_SEED",
    ruleVersion: MONTHLY_TICKET_POLICY_VERSION,
    ticketMode: MONTHLY_TICKET_MODE,
    candidateCount: MONTHLY_CANDIDATE_COUNT,
    lineupGroupCount,
    raceSelectGradeSeed: valueSeed ? "B" : "A",
    purchaseDecisionSeed: valueSeed ? "VALUE_BUY" : "BUY",
    purchasePointsSeed,
    investmentYenSeed: purchasePointsSeed * 100 as 800 | 1000,
    reasonCodes,
    finalizationRequired: true,
  };
}

export function formatMonthlyPreRaceSeedLines(seed: MonthlyPreRaceSeed): string[] {
  return [
    `- metaStatus: ${seed.metaStatus}`,
    `- ruleVersion: ${seed.ruleVersion}`,
    `- ticketMode: ${seed.ticketMode}`,
    `- candidateCount: ${seed.candidateCount}`,
    `- lineupGroupCount: ${seed.lineupGroupCount}`,
    `- raceSelectGradeSeed: ${seed.raceSelectGradeSeed}`,
    `- purchaseDecisionSeed: ${seed.purchaseDecisionSeed}`,
    `- purchasePointsSeed: ${seed.purchasePointsSeed}`,
    `- investmentYenSeed: ${seed.investmentYenSeed}`,
    `- reasonCodes: ${seed.reasonCodes.join(", ") || "none"}`,
    `- finalizationRequired: ${seed.finalizationRequired}`,
    "- final fields required from GPT: raceSelectGrade, purchaseDecision, ruleVersion, candidateCount, purchasePoints, investmentYen",
    "- pre-race seedは参考値。2〜3分戦だけでAを確定しない。頭候補・1/2着枝・3着接続・追走不安・事前オッズ・採算を評価し、GPTが最終判定する。",
  ];
}

const toPublicUrl = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
};

export async function loadMonthlyReviewIndex(): Promise<MonthlyReviewIndexItem[]> {
  const response = await fetch(toPublicUrl(MONTHLY_REVIEW_INDEX_URL), { cache: "no-store" });
  if (!response.ok) throw new Error(`monthly-review-index-${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data as MonthlyReviewIndexItem[] : [];
}

export async function loadMonthlyReviewText(file: string): Promise<string> {
  const response = await fetch(toPublicUrl(file), { cache: "no-store" });
  if (!response.ok) throw new Error(`monthly-review-text-${response.status}`);
  return response.text();
}

export async function getActiveMonthlyReview(): Promise<{
  item: MonthlyReviewIndexItem | null;
  text: string;
  digest: MonthlyReviewDigest | null;
}> {
  const index = await loadMonthlyReviewIndex();
  const activeItem =
    index.find((item) => item.status === "active") ??
    index.find((item) => item.status !== "draft") ??
    null;
  if (!activeItem) return { item: null, text: "", digest: null };

  const text = await loadMonthlyReviewText(activeItem.file);
  return {
    item: activeItem,
    text,
    digest: parseMonthlyReviewDigest(text),
  };
}

const matchFirst = (text: string, patterns: RegExp[]) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
};

export function parseMonthlyReviewDigest(text: string): MonthlyReviewDigest {
  const rawText = String(text ?? "");
  const digest: MonthlyReviewDigest = {
    stableCohort: matchFirst(rawText, [
      /監査対象\s*[:：]\s*([^\n]+)/u,
      /STABLE COHORT\s*[:：]\s*([^\n]+)/i,
      /対象期間\s*[:：]\s*([^\n]+)/u,
      /scope\s*[:：]\s*([^\n]+)/i,
    ]),
    hitRateAny: matchFirst(rawText, [
      /ANY HIT RATE\s*[:：]\s*([^\n]+)/i,
      /いずれか的中率\s*[:：]\s*([^\n]+)/u,
      /的中率\s*[:：]\s*([^\n]+)/u,
    ]),
    hitRate3tan: matchFirst(rawText, [
      /3TAN HIT RATE\s*[:：]\s*([^\n]+)/i,
      /3連単(?:的中率)?\s*[:：]\s*([^\n]+)/u,
    ]),
    hitRate2tan: matchFirst(rawText, [
      /2TAN HIT RATE\s*[:：]\s*([^\n]+)/i,
      /2車単(?:的中率)?\s*[:：]\s*([^\n]+)/u,
    ]),
    thirdOnlyMiss: matchFirst(rawText, [
      /3着だけ抜け\s*[:：]\s*([^\n]+)/u,
      /THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i,
      /3着(?:抜け|補正)\s*[:：]\s*([^\n]+)/u,
    ]),
    headMiss: matchFirst(rawText, [
      /HEAD MISS\s*[:：]\s*([^\n]+)/i,
      /頭候補\s*[:：]\s*([^\n]+)/u,
    ]),
    targetHitRateAny: matchFirst(rawText, [
      /TARGET ANY HIT RATE\s*[:：]\s*([^\n]+)/i,
      /Aランク(?:選抜購入)?的中率\s*[:：]\s*([^\n]+)/u,
      /目標.*的中率\s*[:：]\s*([^\n]+)/u,
    ]),
    targetHitRate3tan: matchFirst(rawText, [
      /TARGET 3TAN HIT RATE\s*[:：]\s*([^\n]+)/i,
      /全購入(?:レース)?3連単的中率\s*[:：]\s*([^\n]+)/u,
      /目標.*3連単\s*[:：]\s*([^\n]+)/u,
    ]),
    targetHitRate2tan: matchFirst(rawText, [
      /TARGET 2TAN HIT RATE\s*[:：]\s*([^\n]+)/i,
      /目標.*2車単\s*[:：]\s*([^\n]+)/u,
    ]),
    targetRecoveryRate: matchFirst(rawText, [
      /TARGET RECOVERY RATE\s*[:：]\s*([^\n]+)/i,
      /目標回収率\s*[:：]\s*([^\n]+)/u,
      /回収率80[〜～-]90%/u,
    ]),
    targetThirdOnlyMiss: matchFirst(rawText, [
      /TARGET THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i,
      /18候補内的中率\s*[:：]\s*([^\n]+)/u,
      /影買い目\s*[:：]\s*([^\n]+)/u,
    ]),
    fixedFormat: matchFirst(rawText, [
      /固定形式\s*[:：]\s*([^\n]+)/u,
      /FIXED FORMAT\s*[:：]\s*([^\n]+)/i,
      /標準8点[^\n]*/u,
      /最大14点[^\n]*/u,
    ]),
    mission: matchFirst(rawText, [
      /現在ミッション\s*[:：]\s*([^\n]+)/u,
      /CURRENT MISSION\s*[:：]\s*([^\n]+)/i,
      /次の主戦場は候補生成ではなく購入順位。/u,
      /9月はレース選抜を導入[^\n]*/u,
      /9月は18点固定へ戻さない[^\n]*/u,
      /18点固定(?:購入)?を廃止[^\n]*/u,
    ]),
    rawText,
  };

  return {
    ...FALLBACK_DIGEST,
    ...Object.fromEntries(
      Object.entries(digest).filter(([, value]) => value !== ""),
    ),
    rawText,
  };
}

export function buildMonthlyPredictionGuidance({
  digest,
  raceTitle = "",
  gradeLabel = "",
  lineup = "",
  isCancelled = false,
  hasVenueMaster = false,
  hasReviewSummary = false,
  hasRegisteredRiderMemo = false,
}: {
  digest?: MonthlyReviewDigest | null;
  raceTitle?: string;
  gradeLabel?: string;
  lineup?: string;
  isCancelled?: boolean;
  hasVenueMaster?: boolean;
  hasReviewSummary?: boolean;
  hasRegisteredRiderMemo?: boolean;
}) {
  const effectiveDigest = digest ?? FALLBACK_DIGEST;
  const preRaceSeed = buildMonthlyPreRaceSeed({
    lineup,
    raceTitle,
    gradeLabel,
    isCancelled,
    monthlyReviewAvailable: Boolean(digest),
  });
  const flags: string[] = [];
  const title = `${gradeLabel} ${raceTitle} ${lineup}`.trim();
  if (!lineup.trim() || /未取得|未掲載|なし/u.test(lineup)) {
    flags.push("ライン未取得: ライン固定で決め打ちしない");
  }
  if (/新人|アドバンス|男ア|ガールズ新人/u.test(title)) {
    flags.push("新人戦・アドバンス戦: 脚力差と上がりを優先し、影候補で監査する");
  }
  if (/ガールズ/u.test(title)) {
    flags.push("ガールズ戦: A/B/C条件を再評価し、構造を絞れなければC / SKIPを検討する");
  }
  if (hasVenueMaster) flags.push("会場マスターあり: 価値型会場か低効率会場か確認する");
  if (hasReviewSummary) flags.push("Summary学習メモあり: 直近レビュー由来の注意点を反映する");
  if (hasRegisteredRiderMemo) flags.push("登録選手特徴あり: 選手カードの強み・警戒を確認する");
  if (isCancelled) flags.push("中止: 予想対象から除外する");

  return [
    "[N. 月次振り返り反映 / 2026年10月 5か月深掘り監査ルール]",
    "",
    "【改善根拠 / 9月実績（10月の達成値ではない）】",
    "- 購入的中率40.68%、購入回収率69.27%、3着だけ抜け502R。Aの65〜70%は未達目標。",
    "",
    `【可変点数ルール ${MONTHLY_TICKET_POLICY_VERSION}】`,
    "- 18点固定購入は禁止。購入は3連単8〜14点可変、1点100円固定。",
    "- 標準は3連単8点=800円。",
    "- 拡張は10点=1,000円。",
    "- 価値条件が強い場合は12点=1,200円。",
    "- 最大は14点=1,400円。",
    "- 18候補は生成するが購入は最大14点。購入外候補は影買い目として保存・監査する。",
    "- 頭候補は2〜4人まで。",
    "- 頭候補5人以上が必要ならC / SKIPを検討する。",
    "- 追加点は新しい頭ではなく2着・3着補正へ使う。",
    "- 大穴頭は最後。根拠の薄い大穴固定枠は置かない。",
    "- 2車単parser/過去照合は残すが、10月運用では新規購入対象外。",
    "- 投資額は確定した実購入券面数 * 100。影買い目は投資額に含めない。",
    "- 買い目ごとに購入順位、購入/影買い目、役割、予想時オッズ・取得時刻、展開理由を予想本文へ記録する。未取得は推測しない。",
    `- 採算確認: ${effectiveDigest.targetRecoveryRate || FALLBACK_DIGEST.targetRecoveryRate}`,
    `- 現在ミッション: ${effectiveDigest.mission || FALLBACK_DIGEST.mission}`,
    "",
    "【A/B/Cレース選別】",
    "- A / HIT (BUY): 2〜3分戦だけでA確定にしない。頭候補2人以内、主要1/2着枝と3着接続、追走不安、事前オッズ、購入採算を確認。8〜10点。65〜70%は未達目標。",
    "- B / VALUE (VALUE_BUY): 異なる展開と3着の別線・単騎混入を説明できる場合に10〜12点。独立した強い根拠がある時だけ14点。",
    "- C / SKIP (SKIP): 頭候補5人以上、並び不明、重大な不確定要素、LOW SAMPLE依存、展開分散。購入0点、可能なら18候補は影として保存。",
    "",
    "【SHADOW VALUE SCORE】",
    "- VALUE-1: 本線の1着または2着を維持している。",
    "- VALUE-2: 穴選手の2着/3着に、別線番手・単騎・ライン3番手・当地適性・追走など明確な役割がある。",
    "- VALUE-3: 人気薄という理由ではなく、番手差し・逆目として説明できる。",
    "- VALUE-4: 主導権選手またはB選手の残り筋として説明できる。",
    "- VALUE-5: 会場EX、時間帯、グレード、級班、分戦数、当日風/バンク条件、KURARI EXのうち2条件以上が支持する。",
    "- VALUE-1〜5のうち3条件以上ならshadowValueCandidate=true。購入上限内で低評価候補と入れ替え、最大1〜2点のみupgradedFromShadow=trueにできる。",
    "- 昇格を追加購入にしない。Aは8〜10点、Bは10〜14点、Cは0点の上限を必ず守る。",
    "- 昇格判断には予想時の根拠だけを使う。結果から影の当たり券を後知恵で昇格させない。",
    "",
    "【3着接続監査】",
    "- 主要な1着-2着の各枝ごとに、本線3番手の残り、別線自力・別線番手の3着、単騎・追込の差し込みを確認する。",
    "- 同じ3車の順序入替、番手差しと先行残り、別線頭＋本線の自然な着順を確認する。根拠のない固定大穴枠は作らない。",
    "",
    "【予想の処理順序】",
    "0. Web側pre-race seedを参考値として確認する。seedを最終判定として固定しない。",
    "1. 頭候補数・主要展開・KURARI EX・オッズ・影VALUEを評価し、raceSelectGradeをA/B/Cで最終判定する。",
    "2. purchaseDecisionをBUY/VALUE_BUY/SKIPで最終判定する。",
    "3. 3連単18候補を生成する。",
    "4. レース上限内で購入候補を選ぶ。A=8〜10点、B=10〜14点、C=0点。",
    "5. 残りを影買い目へ分ける。",
    "6. 影候補のVALUE-1〜5を再評価する。",
    "7. 3条件以上なら最大1〜2点の入れ替え昇格を検討する。",
    "8. 最終購入点数を確定する。",
    "9. investmentYen=purchasePoints*100で算出する。影買い目は含めない。",
    "",
    "【最終出力メタ情報】",
    "- required race fields: raceSelectGrade, purchaseDecision, ruleVersion, candidateCount, purchasePoints, investmentYen",
    "- 予想時のレース情報: raceSelectGradeSeed, raceSelectGrade, purchaseDecisionSeed, purchaseDecision, ruleVersion, candidateCount, purchasePoints, investmentYen, gradeReasonCodes, purchaseFinalizedAt（確認できる場合のみ）",
    "- 予想時の買い目情報: rank, purchaseFlag, role, oddsAtPrediction, oddsSourceTime, valueScore, valueReasons, shadowRank, shadowValueCandidate, upgradedFromShadow, replacedTicket",
    "- 上記の詳細証跡はGPT出力指示であり、現在の簡易StructuredPrediction JSONに全項目が永続保存されることを意味しない。保存済み予想テキストの事前記録を確認する。",
    "- 結果TXTの的中/pendingより購入券面と3連単払戻の直接照合を優先する。発走後のsource取得は警告し、取得時刻不明は未取得のまま扱う。",
    "- unknown sourceを公式扱いしない。気象近傍予報をバンク実測風速と呼ばない。EXのstale / LOW SAMPLE / usage prohibitedを強い購入根拠にしない。",
    "",
    "【レースごとの可変点数メタ情報】",
    ...formatMonthlyPreRaceSeedLines(preRaceSeed),
    "",
    "【予想依頼テンプレ】",
    "{会場名}競輪場{グレード}、{日付}、{R}を、10月運用（A/B/C選別・A8〜10点/B10〜14点/C0点・影18候補）で予想してください。",
    "購入買い目と影買い目を分け、各買い目に購入順位・役割・予想時オッズ・配当帯・展開理由・VALUE判定を必ず付けてください。",
    "登録番号など不明な項目はsource contractを優先し、推測補完しないでください。",
    "",
    ...(flags.length ? ["【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
