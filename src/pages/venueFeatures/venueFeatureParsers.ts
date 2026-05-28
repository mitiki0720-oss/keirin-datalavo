import {
  DEFAULT_VENUE_BANK_SUMMARY,
  EMPTY_VENUE_INSIGHT_SUMMARY,
  type VenueBankSummary,
  type VenueChecklistItem,
  type VenueDetailBlock,
  type VenueDetailSection,
  type VenueInsightGroup,
  type VenueDetailTable,
  type VenueInsightIndexItem,
  type VenueInsightSource,
  type VenueInsightSummary,
  type VenueMasterSummary,
  type VenueMarkdownDocument,
  type VenueMetaEntry,
} from "./venueFeatureTypes";

export function normalizeVenueLookupName(value?: string | null) {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/競輪場|競輪/g, "")
    .replace(/[\s　]/g, "")
    .replace(/[()（）]/g, "")
    .trim();

  if (["伊東温泉", "ito-onsen", "itoonsen", "ito"].includes(normalized)) return "伊東".toLowerCase();
  return normalized;
}

export function normalizeVenueInsightStatus(status?: string | null) {
  return status === "planned" ? "planned" : "ready";
}

export function isVenueInsightSource(value?: string | null): value is VenueInsightSource {
  return value === "bank-master" || value === "review-summary";
}

export function isVenueInsightEntryReady(entry?: Pick<VenueInsightIndexItem, "status"> | null) {
  return normalizeVenueInsightStatus(entry?.status) === "ready";
}

export function groupVenueInsightEntries(insights: VenueInsightIndexItem[]): VenueInsightGroup[] {
  const groups = new Map<string, VenueInsightGroup>();

  insights.forEach((item) => {
    if (!isVenueInsightSource(item.source)) return;

    const groupKey = normalizeVenueLookupName(item.venueName || item.venueKey);
    const current = groups.get(groupKey) ?? {
      venueKey: item.venueKey,
      venueName: item.venueName,
      aliases: item.aliases,
    };

    if (item.source === "bank-master") {
      current.bankMasterEntry = item;
    }
    if (item.source === "review-summary") {
      current.reviewSummaryEntry = item;
    }

    groups.set(groupKey, current);
  });

  return Array.from(groups.values());
}

export function findVenueInsightGroup(
  insights: VenueInsightGroup[],
  venueName: string,
  venueKey?: string,
) {
  const normalizedVenue = normalizeVenueLookupName(venueName);
  return (
    insights.find((item) => {
      if (venueKey && item.venueKey === venueKey) return true;
      if (normalizeVenueLookupName(item.venueName) === normalizedVenue) return true;
      return Array.isArray(item.aliases)
        ? item.aliases.some((alias) => normalizeVenueLookupName(alias) === normalizedVenue)
        : false;
    }) ?? null
  );
}

export function findVenueInsightTarget(
  insights: VenueInsightIndexItem[],
  venueName: string,
  venueKey?: string,
) {
  return findVenueInsightGroup(groupVenueInsightEntries(insights), venueName, venueKey);
}

export function toCompactSingleLine(value?: string | null): string {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[>*#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVenueMarkdownText(value: string): string {
  return value
    .replace(/^>\s?/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\\$/g, "")
    .trim();
}

function clipVenueBankText(value: string, max = 78): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

function findFirstVenueBankLine(markdown: string, patterns: RegExp[]): string {
  for (const line of markdown.split(/\r?\n/)) {
    const compact = line.trim();
    if (!compact) continue;
    for (const pattern of patterns) {
      const match = compact.match(pattern);
      if (match?.[1]) return toCompactSingleLine(match[1]);
    }
  }
  return "";
}

function deriveVenueBankTarget(feature: string, markdown: string): string {
  const source = `${feature} ${markdown}`;
  if (/番手差し|差し届|差し優勢|追込/.test(source)) return "番手差し・差し脚上位を優先。";
  if (/三番手残り|直列残り/.test(source)) return "ライン3番手まで残り目を押さえたい。";
  if (/捲り|機動力|カマシ/.test(source)) return "機動力上位の捲り・カマシを高め評価。";
  if (/先行|逃げ/.test(source)) return "主導権を取れる先行ラインから組み立て。";
  return "主導権ラインと番手差しをセットで確認。";
}

function deriveVenueBankCaution(feature: string, markdown: string): string {
  const source = `${feature} ${markdown}`;
  if (/強風|風が強い|風向/.test(source)) return "風向きが強い日は傾向変動あり。直前気配を優先。";
  if (/波乱|荒れ/.test(source)) return "人気一本より、相手ズレと3着穴を残したい。";
  if (/直線長|差し届/.test(source)) return "逃げ一本の押し切り決め打ちはやや危険。";
  if (/ミッド|ナイター/.test(source)) return "時間帯で流れが変わりやすい。位置取りも要確認。";
  return "当日の並びと主導権候補がズレたら印を寄せ直す。";
}

export function parseVenueBankSummary(markdown: string): VenueBankSummary {
  const summaryBlockMatch = markdown.match(/##\s*SUMMARY([\s\S]*?)(?=\n##\s|$)/i);
  const summaryBlock = summaryBlockMatch?.[1] ?? "";

  const fromSummary = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = summaryBlock.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${escaped}\\s*[:：]\\s*(.+)`, "i"));
    return toCompactSingleLine(match?.[1]);
  };

  const bankLength =
    fromSummary("バンク長") ||
    findFirstVenueBankLine(markdown, [/バンク長\s*[:：]\s*([^\n]+)/i, /会場[:：].*?[（(]\s*(\d{3,4})\s*[）)]/i]) ||
    DEFAULT_VENUE_BANK_SUMMARY.bankLength;

  const feature =
    fromSummary("ひとこと特徴") ||
    findFirstVenueBankLine(markdown, [
      /バンク特性\s*[:：]\s*([^\n]+)/i,
      /バンク体感[^:：]*[:：]\s*([^\n]+)/i,
      /所感\s*[:：]\s*([^\n]+)/i,
    ]) ||
    DEFAULT_VENUE_BANK_SUMMARY.feature;

  const target = fromSummary("狙いどころ") || deriveVenueBankTarget(feature, markdown);
  const caution = fromSummary("注意点") || deriveVenueBankCaution(feature, markdown);

  return {
    bankLength: clipVenueBankText(bankLength, 28),
    feature: clipVenueBankText(feature, 92),
    target: clipVenueBankText(target, 72),
    caution: clipVenueBankText(caution, 72),
    source: summaryBlockMatch ? "SUMMARY" : "auto-extract",
  };
}

function parseMarkdownTableRow(line: string): string[] {
  const sanitized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return sanitized.split("|").map((cell) => normalizeVenueMarkdownText(cell.trim()));
}

function isMarkdownTableSeparator(line: string): boolean {
  const sanitized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!sanitized.includes("-")) return false;
  return sanitized.split("|").every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseMarkdownTable(lines: string[]): VenueDetailTable | null {
  if (lines.length < 2) return null;
  const headers = parseMarkdownTableRow(lines[0]);
  const bodyLines = isMarkdownTableSeparator(lines[1]) ? lines.slice(2) : lines.slice(1);
  const rows = bodyLines
    .map((line) => parseMarkdownTableRow(line))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (headers.length === 0 || rows.length === 0) return null;
  return { headers, rows };
}

function findVenueMetaValue(markdown: string, aliases: string[]): string {
  for (const alias of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:：]\\s*(.+)`, "m"),
      new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[（(][^\\n]*[)）]\\s*[:：]?\\s*(.+)`, "m"),
    ];

    for (const pattern of patterns) {
      const match = markdown.match(pattern);
      if (match?.[1]) return normalizeVenueMarkdownText(match[1]);
    }
  }

  return "";
}

function extractVenueMeta(markdown: string): VenueMetaEntry[] {
  const metaDefinitions = [
    { label: "場名", aliases: ["場名"] },
    { label: "想定カテゴリ", aliases: ["想定カテゴリ"] },
    { label: "データ期間", aliases: ["データ期間"] },
    { label: "使用ソース", aliases: ["使用ソース"] },
    { label: "最終更新日", aliases: ["最終更新日", "更新日"] },
    { label: "集計対象", aliases: ["集計対象", "対象", "データ期間"] },
    { label: "周長", aliases: ["周長", "バンク長"] },
    { label: "カント", aliases: ["カント"] },
    { label: "みなし直線", aliases: ["みなし直線", "見なし直線"] },
  ];

  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const derivedVenueName = titleMatch?.[1]
    ? normalizeVenueMarkdownText(titleMatch[1]).match(/青森|別府|岐阜|函館|平塚|防府|福井|いわき平|川崎|京王閣|岸和田|小倉|小松島|高知|久留米|前橋|松戸|松阪|名古屋|奈良|小田原|大垣|大宮|佐世保|西武園|静岡|立川|高松|武雄|玉野|取手|富山|豊橋|宇都宮|弥彦|四日市/u)?.[0] ?? ""
    : "";

  return metaDefinitions
    .map(({ label, aliases }) => {
      const value = findVenueMetaValue(markdown, aliases);
      if (value) return { label, value };
      if (label === "場名" && derivedVenueName) return { label, value: `${derivedVenueName}競輪場` };
      return null;
    })
    .filter((entry): entry is VenueMetaEntry => !!entry && !!entry.value);
}

function getDocumentMetaValue(meta: VenueMetaEntry[], labels: string[]) {
  for (const label of labels) {
    const match = meta.find((entry) => entry.label === label);
    if (match?.value) return match.value;
  }
  return "";
}

function getSectionPlainText(section: VenueDetailSection): string {
  const lines: string[] = [];
  section.blocks.forEach((block) => {
    if (block.type === "paragraph" || block.type === "quote") {
      block.text
        .split(/\n+/)
        .map((line) => normalizeVenueMarkdownText(line))
        .filter(Boolean)
        .forEach((line) => lines.push(line));
      return;
    }
    if (block.type === "list") {
      block.items
        .map((item) => normalizeVenueMarkdownText(item))
        .filter(Boolean)
        .forEach((item) => lines.push(item));
      return;
    }
    if (block.type === "checklist") {
      block.items
        .map((item) => normalizeVenueMarkdownText(item.text))
        .filter(Boolean)
        .forEach((item) => lines.push(item));
    }
  });
  return lines.join(" ");
}

function getDocumentSectionSnippet(document: VenueMarkdownDocument, keywords: string[], fallback = "", max = 116) {
  const hit = document.sections.find((section) =>
    keywords.some((keyword) => section.title.includes(keyword) || getSectionPlainText(section).includes(keyword)),
  );
  if (!hit) return fallback;
  const text = getSectionPlainText(hit).replace(/\s+/g, " ").trim();
  return clipVenueBankText(text || fallback, max);
}

export function parseVenueMarkdownDocument(markdown: string): VenueMarkdownDocument {
  const sections: VenueDetailSection[] = [];
  const meta = extractVenueMeta(markdown);
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const documentTitle = titleMatch?.[1] ? normalizeVenueMarkdownText(titleMatch[1]) : "会場分析ノート";
  const bodyMarkdown = markdown.replace(/##\s*SUMMARY([\s\S]*?)(?=\n##\s|$)/i, "").trim();
  let currentTitle = "本文";
  let currentBlocks: VenueDetailBlock[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let checklistItems: VenueChecklistItem[] = [];
  let quoteLines: string[] = [];
  let tableLines: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const text = paragraphLines.join("\n").trim();
    if (text) currentBlocks.push({ type: "paragraph", text });
    paragraphLines = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    currentBlocks.push({ type: "list", items: [...listItems] });
    listItems = [];
  };

  const flushChecklist = () => {
    if (checklistItems.length === 0) return;
    currentBlocks.push({ type: "checklist", items: [...checklistItems] });
    checklistItems = [];
  };

  const flushQuote = () => {
    if (quoteLines.length === 0) return;
    const text = quoteLines.join("\n").trim();
    if (text) currentBlocks.push({ type: "quote", text });
    quoteLines = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const table = parseMarkdownTable(tableLines);
    if (table) currentBlocks.push({ type: "table", table });
    tableLines = [];
  };

  const flushInlineBlocks = () => {
    flushParagraph();
    flushList();
    flushChecklist();
    flushQuote();
    flushTable();
  };

  const flushSection = () => {
    flushInlineBlocks();
    if (currentBlocks.length === 0) return;
    sections.push({
      title: currentTitle || "本文",
      blocks: [...currentBlocks],
    });
    currentBlocks = [];
  };

  for (const rawLine of bodyMarkdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    if (/^---+$/.test(trimmed)) {
      flushInlineBlocks();
      if (currentBlocks.length > 0) currentBlocks.push({ type: "rule" });
      continue;
    }

    if (!trimmed) {
      flushInlineBlocks();
      continue;
    }

    const sectionHeading = trimmed.match(/^##\s+(.+)$/);
    if (sectionHeading) {
      flushSection();
      currentTitle = normalizeVenueMarkdownText(sectionHeading[1]);
      continue;
    }

    if (/^#\s+/.test(trimmed)) continue;

    const subheading = trimmed.match(/^#{3,6}\s+(.+)$/);
    if (subheading) {
      flushInlineBlocks();
      currentBlocks.push({ type: "subheading", text: normalizeVenueMarkdownText(subheading[1]) });
      continue;
    }

    if (trimmed.includes("|") && trimmed.split("|").length >= 3) {
      flushParagraph();
      flushList();
      flushChecklist();
      flushQuote();
      tableLines.push(line);
      continue;
    }
    flushTable();

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushChecklist();
      quoteLines.push(normalizeVenueMarkdownText(trimmed));
      continue;
    }
    flushQuote();

    const checklist = trimmed.match(/^[-*]\s+\[( |x|X)\]\s+(.+)$/);
    if (checklist) {
      flushParagraph();
      flushList();
      checklistItems.push({
        checked: checklist[1].toLowerCase() === "x",
        text: normalizeVenueMarkdownText(checklist[2]),
      });
      continue;
    }
    flushChecklist();

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      listItems.push(normalizeVenueMarkdownText(bullet[1]));
      continue;
    }
    flushList();

    paragraphLines.push(normalizeVenueMarkdownText(line));
  }

  flushSection();

  return { title: documentTitle, meta, sections };
}

export function parseVenueMasterSummary(
  markdown: string,
  fallback: Partial<Pick<VenueMasterSummary, "updatedAt">> = {},
): VenueMasterSummary {
  const document = parseVenueMarkdownDocument(markdown);
  const bankLength = getDocumentMetaValue(document.meta, ["周長", "バンク長"]);
  const cant = getDocumentMetaValue(document.meta, ["カント"]);
  const straight = getDocumentMetaValue(document.meta, ["みなし直線"]);
  const overview = getDocumentSectionSnippet(document, ["傾向まとめ", "バンク仕様", "決まり手"], "会場別マスター分析を整備中です。");
  const wind = getDocumentSectionSnippet(document, ["風", "向かい風", "追い風"], "風向きの癖はマスター分析に記載されています。", 96);
  const strategy = getDocumentSectionSnippet(document, ["ライン", "戦術", "運用", "チェックリスト", "グレード"], "戦術メモはマスター分析の本文側を参照してください。", 108);

  const parts = [
    bankLength ? `周長 ${bankLength}` : "",
    cant ? `カント ${cant}` : "",
    straight ? `みなし直線 ${straight}` : "",
    overview ? `傾向: ${overview}` : "",
    wind ? `風: ${wind}` : "",
    strategy ? `戦術: ${strategy}` : "",
  ].filter(Boolean);

  return {
    title: document.title,
    updatedAt: fallback.updatedAt || getDocumentMetaValue(document.meta, ["最終更新日", "更新日"]),
    bankLength,
    cant,
    straight,
    overview,
    wind,
    strategy,
    gptMaterial: parts.join(" / "),
    hasContent: parts.length > 0,
  };
}

export function deriveVenueTags(summary: VenueBankSummary): string[] {
  const src = `${summary.feature} ${summary.target} ${summary.caution}`;
  const tags: string[] = [];
  if (/先行|逃げ/.test(src)) tags.push("先行注目");
  if (/番手差し|差し届|差し優勢|追込/.test(src)) tags.push("差し注目");
  if (/捲り|機動力/.test(src)) tags.push("捲り注意");
  if (/波乱|荒れ/.test(src)) tags.push("波乱含み");
  if (/強風|風が強い|風向/.test(src)) tags.push("風向き注意");
  if (/ナイター|ミッド/.test(src)) tags.push("ナイター変化");
  return tags.slice(0, 3);
}

function extractLabeledValue(block: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = block.match(new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${escaped}\\s*[:：]\\s*(.+)`, "i"));
    if (match?.[1]) return toCompactSingleLine(match[1]);
  }
  return "";
}

function extractMarkdownBlock(markdown: string, heading: string) {
  return markdown.match(new RegExp(`##\\s*${heading}([\\s\\S]*?)(?=\\n##\\s|$)`, "i"))?.[1] ?? "";
}

export function parseVenueInsightMarkdown(
  markdown: string,
  fallback: Partial<Pick<VenueInsightSummary, "updatedAt" | "source">> = {},
): VenueInsightSummary {
  const summaryBlock = extractMarkdownBlock(markdown, "SUMMARY_INSIGHT");
  const gptBlock = extractMarkdownBlock(markdown, "GPT_MATERIAL");
  const learnedFeature = extractLabeledValue(summaryBlock, ["学習特徴", "特徴"]);
  const learnedTarget = extractLabeledValue(summaryBlock, ["予想で使う狙い", "狙い", "狙いどころ"]);
  const learnedCaution = extractLabeledValue(summaryBlock, ["警戒", "注意点"]);
  const learnedPeriod = extractLabeledValue(summaryBlock, ["反映期間", "対象期間"]);
  const root = extractLabeledValue(summaryBlock, ["根拠", "参照"]);
  const gptMaterial = gptBlock
    .split(/\r?\n/)
    .map((line) => normalizeVenueMarkdownText(line))
    .filter(Boolean)
    .join("\n");
  const hasContent = [learnedFeature, learnedTarget, learnedCaution, learnedPeriod, gptMaterial].some(Boolean);

  return {
    learnedFeature,
    learnedTarget,
    learnedCaution,
    learnedPeriod,
    root,
    gptMaterial,
    updatedAt: fallback.updatedAt ?? "",
    source: fallback.source ?? (hasContent ? "linked" : "missing"),
    hasContent,
  };
}

export function formatVenueInsightMemo(summary: VenueInsightSummary) {
  if (!summary.hasContent) return "";

  return [
    "【Summary学習メモ】",
    summary.learnedFeature ? `学習特徴: ${summary.learnedFeature}` : "",
    summary.learnedTarget ? `予想で使う狙い: ${summary.learnedTarget}` : "",
    summary.learnedCaution ? `警戒: ${summary.learnedCaution}` : "",
    summary.learnedPeriod ? `反映期間: ${summary.learnedPeriod}` : "",
    summary.gptMaterial ? `GPT素材用まとめ: ${summary.gptMaterial}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export { DEFAULT_VENUE_BANK_SUMMARY, EMPTY_VENUE_INSIGHT_SUMMARY };