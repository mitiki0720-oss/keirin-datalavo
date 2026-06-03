import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";

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
  return {
    stableCohort: matchFirst(rawText, [/STABLE COHORT\s*[:：]\s*([^\n]+)/i, /安定母集団\s*[:：]\s*([^\n]+)/u]),
    hitRateAny: matchFirst(rawText, [/ANY HIT RATE\s*[:：]\s*([^\n]+)/i, /いずれか的中率\s*[:：]\s*([^\n]+)/u]),
    hitRate3tan: matchFirst(rawText, [/3TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /3連単的中率\s*[:：]\s*([^\n]+)/u]),
    hitRate2tan: matchFirst(rawText, [/2TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /2車単的中率\s*[:：]\s*([^\n]+)/u]),
    thirdOnlyMiss: matchFirst(rawText, [/THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i, /3着だけ抜け\s*[:：]\s*([^\n]+)/u]),
    headMiss: matchFirst(rawText, [/HEAD MISS\s*[:：]\s*([^\n]+)/i, /1着候補不一致\s*[:：]\s*([^\n]+)/u]),
    targetHitRateAny: matchFirst(rawText, [/TARGET ANY HIT RATE\s*[:：]\s*([^\n]+)/i, /目標いずれか的中率\s*[:：]\s*([^\n]+)/u]),
    targetHitRate3tan: matchFirst(rawText, [/TARGET 3TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /目標3連単的中率\s*[:：]\s*([^\n]+)/u]),
    targetThirdOnlyMiss: matchFirst(rawText, [/TARGET THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i, /目標3着抜け率\s*[:：]\s*([^\n]+)/u]),
    fixedFormat: matchFirst(rawText, [/FIXED FORMAT\s*[:：]\s*([^\n]+)/i, /固定フォーマット\s*[:：]\s*([^\n]+)/u]),
    mission: matchFirst(rawText, [/CURRENT MISSION\s*[:：]\s*([^\n]+)/i, /最優先課題\s*[:：]\s*([^\n]+)/u]),
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
  if (!lineup.trim() || /未取得|未掲載|なし/.test(lineup)) flags.push("並び未掲載: ライン固定で決め打ちしない");
  if (/新人|アドバンス|男ア|ガールズ新人/u.test(title)) flags.push("新人戦・アドバンス戦: 個々の走力・直近成績・上がりを優先");
  if (/ガールズ/u.test(title)) flags.push("ガールズ戦: ライン固定ではなく位置取り・自力実績を優先");
  if (hasVenueMaster) flags.push("会場別マスター分析あり: 数値・分戦別ルールを確認する");
  if (hasReviewSummary) flags.push("Summary学習メモあり: 直近レビュー由来の注意点も反映する");
  if (hasRegisteredRiderMemo) flags.push("登録選手特徴あり: 選手カードの強み・警戒を確認する");
  if (isCancelled) flags.push("中止: 予想対象から除外");

  return [
    "[N. 月次振り返り反映 / 今回レースの注意点]",
    "",
    "【現在の固定運用】",
    `- ${digest.fixedFormat || "1R 10点固定 / 1点100円 / 合計1,000円"}`,
    `- 最優先課題: ${digest.mission || "3着だけ抜ける外れを減らす"}`,
    "",
    "【3連単8点の役割】",
    "- CORE: 本線4点",
    "- LINE_3RD / OTHER_SELF / SINGLE / OTHER_MARK: 3着保護4点",
    "- REVERSE: 逆目・崩れ保険",
    "",
    "【2車単2点の役割】",
    "- SALVAGE_REVERSE: 番手差し・逆目の救済",
    "- SALVAGE_BREAK: 別線頭・ライン崩れの単勝頭の救済",
    "",
    "【今回レースで必ず考えること】",
    "- TYPE-AからTYPE-Dのどれに該当するかを最初に判定する",
    "- 3着候補を同じ役割へ偏らせない",
    "- 人気筋を安いという理由だけで全消ししない",
    "- 自信度は発走前情報だけで判定し、データ欠損で過剰に上げない",
    ...(flags.length ? ["", "【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
