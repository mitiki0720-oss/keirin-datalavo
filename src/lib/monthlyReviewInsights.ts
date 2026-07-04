import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";
export const MONTHLY_TICKET_POLICY_VERSION = "v2026-07";
export const MONTHLY_TICKET_MODE = "STANDARD_14";
export const MONTHLY_RECOMMENDED_POINTS = 14;
export const MONTHLY_INVESTMENT_YEN = 1400;
export const MONTHLY_TICKET_REASON_TAGS = [
  "monthly-review-variable-rule",
  "default-standard-14",
  "third-place-protection-required",
] as const;

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
    stableCohort: matchFirst(rawText, [/STABLE COHORT\s*[:：]\s*([^\n]+)/i, /安定母集団\s*[:：]\s*([^\n]+)/u, /有効R\s*[:：]\s*([^\n]+)/u]),
    hitRateAny: matchFirst(rawText, [/ANY HIT RATE\s*[:：]\s*([^\n]+)/i, /いずれか的中率\s*[:：]\s*([^\n]+)/u]),
    hitRate3tan: matchFirst(rawText, [/3TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /3連単的中率\s*[:：]\s*([^\n]+)/u]),
    hitRate2tan: matchFirst(rawText, [/2TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /2車単的中率\s*[:：]\s*([^\n]+)/u]),
    thirdOnlyMiss: matchFirst(rawText, [/THIRD-ONLY MISS\s*[:：]\s*([^\n]+)/i, /3着だけ抜け\s*[:：]\s*([^\n]+)/u]),
    headMiss: matchFirst(rawText, [/HEAD MISS\s*[:：]\s*([^\n]+)/i, /1着候補不一致\s*[:：]\s*([^\n]+)/u]),
    targetHitRateAny: matchFirst(rawText, [/TARGET ANY HIT RATE\s*[:：]\s*([^\n]+)/i, /目標いずれか的中率\s*[:：]\s*([^\n]+)/u, /^-\s*いずれか的中率\s+([^\n]+)/mu]),
    targetHitRate3tan: matchFirst(rawText, [/TARGET 3TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /目標3連単的中率\s*[:：]\s*([^\n]+)/u, /^-\s*3連単的中率\s+([^\n]+)/mu]),
    targetHitRate2tan: matchFirst(rawText, [/TARGET 2TAN HIT RATE\s*[:：]\s*([^\n]+)/i, /目標2車単的中率\s*[:：]\s*([^\n]+)/u, /^-\s*2車単的中率\s+([^\n]+)/mu]),
    targetRecoveryRate: matchFirst(rawText, [/TARGET RECOVERY RATE\s*[:：]\s*([^\n]+)/i, /目標回収率\s*[:：]\s*([^\n]+)/u, /^-\s*回収率\s+([^\n]+)/mu]),
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
    `【可変点数ルール ${MONTHLY_TICKET_POLICY_VERSION}】`,
    "- 月次振り返り: 反映済み",
    "- 1点100円固定",
    "- 点数は10〜18点可変",
    "- 標準は14点",
    "- 2車単は原則2点固定",
    "- 追加点は3連単の3着保護・中穴枠に使う",
    "- 点数を増やす理由を買目設計メモに必ず記録する",
    `- 最優先課題: ${digest.mission || "低配当の的中を維持しながら、中穴用の買い目枠を明示的に作る"}`,
    "",
    "【目標】",
    `- いずれか的中率: ${digest.targetHitRateAny || "40%以上"}`,
    `- 3連単的中率: ${digest.targetHitRate3tan || "32%以上"}`,
    `- 2車単的中率: ${digest.targetHitRate2tan || "10%以上"}`,
    `- 回収率: ${digest.targetRecoveryRate || "75%以上"}`,
    "- 5,000円以上の的中を増やす",
    "- 万車的中を月内最低1本以上",
    "",
    "【レースごとの可変点数メタ情報】",
    `- ticketMode: ${MONTHLY_TICKET_MODE}`,
    `- recommendedPoints: ${MONTHLY_RECOMMENDED_POINTS}`,
    `- investmentYen: ${MONTHLY_INVESTMENT_YEN}`,
    "- reasonTags:",
    ...MONTHLY_TICKET_REASON_TAGS.map((tag) => `  - ${tag}`),
    "",
    "【予想依頼テンプレ】",
    "{会場名}競輪場{グレード}、{日付}、{開催日数}、{R}を月次振り返り反映済みの可変点数ルールで予想してください。",
    "※オッズは記載されているオッズをそのまま使うのではなく、展開をしっかり丁寧に考えた買い目を記載してください。",
    "選手の近況調子がいい・悪いなどは、KDreams出走表詳細、前回出走レース成績、KURARI EX、月次振り返りを参考にしてください。",
    "必ず1Rごとにコピーしやすい形で送ってください。",
    "",
    "～絶対にほしい情報～",
    "1. 日付",
    "2. 会場",
    "3. R",
    "4. 車番",
    "5. 選手名",
    "6. 登録番号",
    "7. 府県",
    "8. 年齢",
    "9. 期",
    "10. 級班",
    "11. source名",
    "12. source取得日時",
    "13. source種別（official / user-entered-from-official / unknown）",
    "登録番号など不明な項目は、素材内のsource contractを優先し、fake補完しないでください。",
    "",
    "【点数タイプ】",
    "- HIT_RATE_10_12: 10〜12点 / 堅い・安い・本線決着濃厚",
    "- STANDARD_14: 14点 / 基本形。迷ったらここ",
    "- VALUE_16: 16点 / 3,000〜15,000円帯を狙える",
    "- VOLATILE_18: 18点 / 別線頭・番手抜け・単騎3着まである",
    "- SKIP_OR_MINIMUM_10: 買わない or 10点 / 展開根拠が薄い",
    "",
    "【点数構成】",
    "- 14点: 3連単12点（本線順目4 / 3着保護4 / 番手差し・逆目2 / 中穴3着・別線絡み2）+ 2車単救済2点",
    "- 16点: 3連単14点（本線順目4 / 3着保護5 / 番手差し・逆目2 / 中穴・別線絡み3）+ 2車単救済2点",
    "- 18点: 3連単16点（本線順目4 / 3着保護5 / 番手差し・逆目3 / 中穴・別線絡み3 / 万車候補1）+ 2車単救済2点",
    "",
    "【印ルール】",
    "- 🔥 的中自信度",
    "- 💎 配当妙味",
    "- ⚡ 荒れ警戒",
    "- 🛡️ 的中保護",
    "",
    "【点数決定】",
    "- 🔥🔥🔥 / 💎なし → 10〜12点",
    "- 🔥🔥 / 🛡️あり → 14点",
    "- 🔥🔥 / 💎あり → 16点",
    "- 🔥 / 💎💎 / ⚡あり → 16〜18点",
    "- 🔥🔥 / 💎💎 / ⚡あり → 18点",
    "- 印なし → 買わない or 10点",
    "",
    "【今回レースで必ず考えること】",
    "- 印と展開根拠から ticketMode を判定する",
    "- 迷う場合は STANDARD_14 を採用する",
    "- 3着候補を人気筋・ライン3番手・別線自力・単騎切替・逆目に分ける",
    "- 人気筋を安いという理由だけで全消ししない",
    "- 根拠なく高配当狙いへ寄せず、fake判定・fake補完をしない",
    ...(flags.length ? ["", "【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
