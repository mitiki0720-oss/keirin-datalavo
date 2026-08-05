import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";
export const MONTHLY_TICKET_POLICY_VERSION = "v2026-08";
export const MONTHLY_TICKET_MODE = "BASE_8_SHADOW_18_TRIFECTA";
export const MONTHLY_RECOMMENDED_POINTS = 8;
export const MONTHLY_INVESTMENT_YEN = 800;
export const MONTHLY_TICKET_REASON_TAGS = [
  "monthly-review-august-rule",
  "base-8",
  "max-14",
  "shadow-18-audit",
  "head-candidates-2-to-4",
  "second-third-correction",
] as const;

const FALLBACK_DIGEST: MonthlyReviewDigest = {
  stableCohort: "2026-05-01〜2026-08-04",
  hitRateAny: "監査レポート参照",
  hitRate3tan: "監査レポート参照",
  hitRate2tan: "8月新ルールでは原則購入対象外",
  thirdOnlyMiss: "2・3着補正で監査",
  headMiss: "頭候補は2〜4人まで",
  targetHitRateAny: "的中率より回収率を優先",
  targetHitRate3tan: "標準8点の質を優先",
  targetHitRate2tan: "原則購入対象外",
  targetRecoveryRate: "80〜90%",
  targetThirdOnlyMiss: "影買い目18候補で監査",
  fixedFormat: "標準8点 / 最大14点 / 18候補は影買い目 / 1点100円固定",
  mission: "18点固定購入を廃止し、標準8点・最大14点・影18候補で回収率を改善する",
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
      /目標.*的中率\s*[:：]\s*([^\n]+)/u,
    ]),
    targetHitRate3tan: matchFirst(rawText, [
      /TARGET 3TAN HIT RATE\s*[:：]\s*([^\n]+)/i,
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
      /影買い目\s*[:：]\s*([^\n]+)/u,
    ]),
    fixedFormat: matchFirst(rawText, [
      /FIXED FORMAT\s*[:：]\s*([^\n]+)/i,
      /標準8点[^\n]*/u,
      /最大14点[^\n]*/u,
    ]),
    mission: matchFirst(rawText, [
      /CURRENT MISSION\s*[:：]\s*([^\n]+)/i,
      /18点固定(?:購入)?を廃止[^\n]*/u,
      /8月新ルール[^\n]*/u,
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
    flags.push("ガールズ戦: LOW_VALUE_4_6候補。価値が薄ければ買いすぎない");
  }
  if (hasVenueMaster) flags.push("会場マスターあり: 価値型会場か低効率会場か確認する");
  if (hasReviewSummary) flags.push("Summary学習メモあり: 直近レビュー由来の注意点を反映する");
  if (hasRegisteredRiderMemo) flags.push("登録選手特徴あり: 選手カードの強み・警戒を確認する");
  if (isCancelled) flags.push("中止: 予想対象から除外する");

  return [
    "[N. 月次振り返り反映 / 2026年8月 3か月深掘り監査ルール]",
    "",
    `【可変点数ルール ${MONTHLY_TICKET_POLICY_VERSION}】`,
    "- 18点固定購入は廃止。",
    "- 標準は3連単8点=800円。",
    "- 拡張は10点=1,000円。",
    "- 価値条件が強い場合は12点=1,200円。",
    "- 最大は14点=1,400円。",
    "- 18点は購入せず、影買い目として保存・監査する。",
    "- 頭候補は2〜4人まで。",
    "- 頭候補5人以上が必要なら見送り候補。",
    "- 追加点は新しい頭ではなく2着・3着補正へ使う。",
    "- 大穴頭は最後。根拠の薄い大穴固定枠は置かない。",
    "- 2車単parser/過去照合は残すが、8月新ルールでは原則購入対象外。",
    "- 投資額は保存された購入買い目数 * 100。影買い目は投資額に含めない。",
    "- 買い目ごとに購入順位、購入/影買い目、役割、予想時オッズ、配当帯、展開理由を保存する。",
    `- 目標回収率: ${digest.targetRecoveryRate || "80〜90%"}`,
    `- 現在ミッション: ${digest.mission || FALLBACK_DIGEST.mission}`,
    "",
    "【点数モード】",
    "- LOW_VALUE_4_6: ガールズ、堅いモーニングF2、低効率会場。価値が薄ければ4〜6点。",
    "- BASE_8: 標準。安め本線2〜4点、中穴2〜4点、3着保護/順番補正2点。",
    "- VALUE_10: 価値条件2つ以上。5,000〜30,000円帯が複数ある時。",
    "- STRONG_VALUE_12: 価値条件3つ以上。S級/G3/価値型会場など根拠が重なる時。",
    "- MAX_14: G3/S級/価値型会場で展開根拠が明確。追加点を2・3着補正へ使える時のみ。",
    "- SHADOW_ONLY: 頭候補5人以上、根拠薄い大穴、展開が散るレース。購入せず研究のみ。",
    "",
    "【レースごとのメタ情報】",
    `- ticketMode: ${MONTHLY_TICKET_MODE}`,
    `- recommendedPoints: ${MONTHLY_RECOMMENDED_POINTS}`,
    `- investmentYen: ${MONTHLY_INVESTMENT_YEN}`,
    "- reasonTags:",
    ...MONTHLY_TICKET_REASON_TAGS.map((tag) => `  - ${tag}`),
    "",
    "【予想依頼テンプレ】",
    "{会場名}競輪場{グレード}、{日付}、{R}を、8月新ルール（標準8点・最大14点・影18候補）で予想してください。",
    "購入買い目と影買い目を分け、各買い目に購入順位・役割・予想時オッズ・配当帯・展開理由を必ず付けてください。",
    "登録番号など不明な項目はsource contractを優先し、推測補完しないでください。",
    "",
    ...(flags.length ? ["【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
