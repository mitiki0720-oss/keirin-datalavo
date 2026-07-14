import type { MonthlyReviewDigest, MonthlyReviewIndexItem } from "../types/monthlyReview";

const MONTHLY_REVIEW_INDEX_URL = "/data/monthly-review/index.json";
export const MONTHLY_TICKET_POLICY_VERSION = "v2026-07";
export const MONTHLY_TICKET_MODE = "STANDARD_18_TRIFECTA_VALUE";
export const MONTHLY_RECOMMENDED_POINTS = 18;
export const MONTHLY_INVESTMENT_YEN = 1800;
export const MONTHLY_TICKET_REASON_TAGS = [
  "monthly-review-value-rule",
  "default-standard-18",
  "trifecta-value-focused",
  "cheap-mainline-max-4",
  "exacta-exception-only",
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
    "- 7/14時点の新ルール",
    "- 目的は的中率の最大化ではなく、払戻単価と回収率の改善",
    "- 1点100円固定",
    "- 基本は3連単18点",
    "- 点数は14〜20点可変",
    "- 堅いレースは14点、標準レースは18点、荒れ含みレースは20点まで",
    "- 原則3連単のみ",
    "- 2車単は原則なし",
    "- ただし20倍以上が見込める穴頭の2車単のみ例外的に採用可",
    "- 安い本線は完全には捨てず、最大4点までに制限する",
    "- 残りは中穴〜大穴へ配分する",
    "- 点数を増やす理由を買目設計メモに必ず記録する",
    `- 最優先課題: ${digest.mission || "的中率の最大化ではなく、払戻単価と回収率を改善する"}`,
    "",
    "【目標】",
    `- いずれか的中率: ${digest.targetHitRateAny || "25〜32%でもOK"}`,
    `- 3連単的中率: ${digest.targetHitRate3tan || "22〜28%でもOK"}`,
    `- 回収率: ${digest.targetRecoveryRate || "80%以上"}`,
    "- 平均払戻を上げる",
    "- 5,000円以上的中率を上げる",
    "- 万車的中本数を月5本以上へ近づける",
    "- 1000倍超えは月1本を狙う",
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
    "- FIRM_14: 14点 / 堅そうなレース。堅いレースで18点買いすぎない",
    "- STANDARD_18: 18点 / 基本形。3連単配当寄せの標準",
    "- VALUE_18: 18点 / 中穴重視。50〜199倍を主戦場にする",
    "- VOLATILE_18_20: 18〜20点 / 荒れ含み。200〜999倍を厚めに混ぜる",
    "- CAUTIOUS_14_16: 14〜16点 / 穴狙いだが展開根拠を慎重に扱う",
    "",
    "【点数構成】",
    "- 堅そうなレース 14点: 安め本線4 + 中穴8 + 大穴2 + 超大穴0",
    "- 標準レース 18点: 安め本線4 + 中穴8 + 大穴4 + 超大穴2",
    "- 荒れそうなレース 20点: 安め本線3 + 中穴8 + 大穴6 + 超大穴3",
    "- 安め本線: 10〜49倍まで。最大4点。当たりを完全に捨てないための保険。ここは絶対に広げない",
    "- 中穴: 50〜199倍。主戦場",
    "- 大穴: 200〜999倍。展開根拠がある時に入れる",
    "- 超大穴: 1000倍超え。1〜3点まで。毎回当てに行く枠ではない",
    "- 〜9.9倍: 原則買わない",
    "",
    "【印ルール】",
    "- 🔥 的中自信度",
    "- 💎 中穴妙味",
    "- ⚡ 大穴・荒れ警戒",
    "- 🧨 1000倍超えロマン枠",
    "- 🛡️ 安め保険",
    "",
    "【点数決定】",
    "- 🔥🔥🔥 / 💎なし → 14点。安め4 + 中穴8 + 大穴2",
    "- 🔥🔥 / 💎あり → 18点。標準型",
    "- 🔥 / 💎💎 → 18点。中穴重視",
    "- 🔥 / 💎 / ⚡あり → 18〜20点。大穴込み",
    "- 🔥なし / ⚡⚡ → 14〜16点。穴狙いだけど慎重",
    "- 🧨あり → 超大穴1〜2点だけ追加",
    "",
    "【今回レースで必ず考えること】",
    "- 🔥が強いから点数を増やすのではなく、💎や⚡があるから点数を増やす",
    "- 50倍未満を買いすぎない",
    "- 安い的中を完全に捨てず、4点だけ残す",
    "- 残りを中穴〜大穴へ振る",
    "- 安め4点の的中率、中穴〜大穴枠の的中率、平均払戻、5,000円以上的中率、万車的中本数を確認する",
    "- 2車単を入れる場合は、20倍以上の穴頭である根拠を買目設計メモに残す",
    "- 根拠なく高配当狙いへ寄せず、fake判定・fake補完をしない",
    ...(flags.length ? ["", "【今回レースの自動注意フラグ】", ...flags.map((flag) => `- ${flag}`)] : []),
  ].join("\n");
}
