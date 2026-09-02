import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";
export const MONTHLY_TICKET_POLICY_VERSION = "v2026-09";
export const MONTHLY_TICKET_MODE = "ABC_8_TO_14_SHADOW_VALUE_TRIFECTA";
export const MONTHLY_RECOMMENDED_POINTS = 8;
export const MONTHLY_INVESTMENT_YEN = 800;
export const MONTHLY_TICKET_REASON_TAGS = [
  "monthly-review-september-rule",
  "abc-race-selection",
  "base-8",
  "max-14",
  "shadow-18-audit",
  "head-candidates-2-to-4",
  "second-third-correction",
  "shadow-value-upgrade-by-replacement",
] as const;

const FALLBACK_DIGEST: MonthlyReviewDigest = {
  stableCohort: "2026-05-01〜2026-08-04",
  hitRateAny: "監査レポート参照",
  hitRate3tan: "監査レポート参照",
  hitRate2tan: "9月新ルールでは新規購入対象外",
  thirdOnlyMiss: "2・3着補正で監査",
  headMiss: "頭候補は2〜4人まで",
  targetHitRateAny: "Aランク 65〜70%",
  targetHitRate3tan: "全購入 45〜55%",
  targetHitRate2tan: "原則購入対象外",
  targetRecoveryRate: "5,000〜30,000円帯を重視",
  targetThirdOnlyMiss: "18候補内 70%以上",
  fixedFormat: "標準8点 / 最大14点 / 18候補は影買い目 / 1点100円固定",
  mission: "A/B/Cで購入レースを選別し、根拠ある影VALUEを上限内で購入へ入れ替える",
  rawText: "",
};

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
      /回収率\s*[:：]\s*([^\n]+)/u,
      /回収率80[〜～-]90%/u,
    ]),
    targetThirdOnlyMiss: matchFirst(rawText, [
      /TARGET THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i,
      /18候補内的中率\s*[:：]\s*([^\n]+)/u,
      /影買い目\s*[:：]\s*([^\n]+)/u,
    ]),
    fixedFormat: matchFirst(rawText, [
      /FIXED FORMAT\s*[:：]\s*([^\n]+)/i,
      /標準8点[^\n]*/u,
      /最大14点[^\n]*/u,
    ]),
    mission: matchFirst(rawText, [
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
  lineup = "",
  isCancelled = false,
  hasVenueMaster = false,
  hasReviewSummary = false,
  hasRegisteredRiderMemo = false,
}: {
  digest?: MonthlyReviewDigest | null;
  raceTitle?: string;
  lineup?: string;
  isCancelled?: boolean;
  hasVenueMaster?: boolean;
  hasReviewSummary?: boolean;
  hasRegisteredRiderMemo?: boolean;
}) {
  if (!digest) return "";

  const flags: string[] = [];
  const title = `${raceTitle} ${lineup}`.trim();
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
    "[N. 月次振り返り反映 / 2026年9月 4か月深掘り監査ルール]",
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
    "- 2車単parser/過去照合は残すが、9月新ルールでは新規購入対象外。",
    "- 投資額は保存された購入買い目数 * 100。影買い目は投資額に含めない。",
    "- 買い目ごとに購入順位、購入/影買い目、役割、予想時オッズ、配当帯、展開理由を保存する。",
    `- 重点回収帯: ${digest.targetRecoveryRate || "5,000〜30,000円帯"}`,
    `- 現在ミッション: ${digest.mission || FALLBACK_DIGEST.mission}`,
    "",
    "【A/B/Cレース選別】",
    "- A / HIT (BUY): 頭候補2人以内、主要展開2つ以内、主導権ラインと3着候補を整理可能。原則8点、必要時のみ10点。Aだから14点へ広げない。",
    "- B / VALUE (VALUE_BUY): S級/Gレース、3〜4分戦、先行競合、番手差しと別線捲りなど、根拠ある中穴〜万車を狙う。10〜12点、非常に強い時のみ14点。",
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
    "",
    "【予想の処理順序】",
    "1. raceSelectGradeをA/B/Cで判定し、purchaseDecisionをBUY/VALUE_BUY/SKIPで決める。",
    "2. 3連単18候補を生成する。",
    "3. レース上限内で購入8〜14点を選び、残りを影へ分ける。Cは購入0点。",
    "4. 影候補のVALUE-1〜5を再評価する。",
    "5. 3条件以上なら最大1〜2点の入れ替え昇格を検討する。",
    "6. 最終購入点数を確定し、investmentYen=購入買い目数*100で算出する。",
    "",
    "【レースごとのメタ情報】",
    `- ticketMode: ${MONTHLY_TICKET_MODE}`,
    `- recommendedPoints: ${MONTHLY_RECOMMENDED_POINTS}`,
    `- investmentYen: ${MONTHLY_INVESTMENT_YEN}`,
    "- reasonTags:",
    ...MONTHLY_TICKET_REASON_TAGS.map((tag) => `  - ${tag}`),
    "- optional race fields: raceSelectGrade, purchaseDecision, ruleVersion, candidateCount, purchasePoints, investmentYen, candidate18Hit, purchaseHit, shadowHit, shadowOnlyHit, purchaseManshuHit, shadowManshuHit, missReason",
    "- optional ticket fields: rank, purchaseFlag, role, oddsAtPrediction, payoutBand, scenario, valueScore, valueReasons, shadowRank, shadowValueCandidate, upgradedFromShadow, resultHit",
    "",
    "【予想依頼テンプレ】",
    "{会場名}競輪場{グレード}、{日付}、{R}を、9月新ルール（A/B/C選別・8〜14点購入・影18候補・影VALUE昇格）で予想してください。",
    "購入買い目と影買い目を分け、各買い目に購入順位・役割・予想時オッズ・配当帯・展開理由・VALUE判定を必ず付けてください。",
    "登録番号など不明な項目はsource contractを優先し、推測補完しないでください。",
    "",
    ...(flags.length ? ["【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
