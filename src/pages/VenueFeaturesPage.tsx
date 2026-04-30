import { Fragment, useEffect, useState, type ReactNode } from "react";
import { venueSpotlightData } from "../data/venueSpotlightData";

const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
};

// ─── Types ─────────────────────────────────────────────────────────────────────
type VenueBankIndexItem = {
  venueKey: string;
  venueName: string;
  file: string;
};

type VenueBankSummary = {
  bankLength: string;
  feature: string;
  target: string;
  caution: string;
  source: string;
};

type VenueDetailTable = {
  headers: string[];
  rows: string[][];
};

type VenueChecklistItem = {
  text: string;
  checked: boolean;
};

type VenueDetailBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "checklist"; items: VenueChecklistItem[] }
  | { type: "quote"; text: string }
  | { type: "table"; table: VenueDetailTable }
  | { type: "subheading"; text: string }
  | { type: "rule" };

type VenueDetailSection = {
  title: string;
  blocks: VenueDetailBlock[];
};

type VenueMetaEntry = {
  label: string;
  value: string;
};

type VenueMarkdownDocument = {
  title: string;
  meta: VenueMetaEntry[];
  sections: VenueDetailSection[];
};

// ─── Region data ───────────────────────────────────────────────────────────────
const REGIONS = [
  "すべて",
  "北海道・東北",
  "関東",
  "南関東",
  "中部",
  "近畿",
  "中国",
  "四国",
  "九州",
] as const;
type RegionType = (typeof REGIONS)[number];

const VENUE_REGION_MAP: Record<string, string> = {
  函館: "北海道・東北",
  青森: "北海道・東北",
  いわき平: "北海道・東北",
  取手: "関東",
  前橋: "関東",
  宇都宮: "関東",
  松戸: "関東",
  弥彦: "関東",
  川崎: "南関東",
  平塚: "南関東",
  小田原: "南関東",
  大宮: "南関東",
  西武園: "南関東",
  立川: "南関東",
  京王閣: "南関東",
  名古屋: "中部",
  岐阜: "中部",
  豊橋: "中部",
  富山: "中部",
  福井: "中部",
  静岡: "中部",
  松阪: "中部",
  四日市: "中部",
  岸和田: "近畿",
  奈良: "近畿",
  和歌山: "近畿",
  大垣: "近畿",
  広島: "中国",
  防府: "中国",
  玉野: "中国",
  高知: "四国",
  松山: "四国",
  高松: "四国",
  小松島: "四国",
  別府: "九州",
  小倉: "九州",
  久留米: "九州",
  熊本: "九州",
  武雄: "九州",
  佐世保: "九州",
};

// ─── Hero image map ─────────────────────────────────────────────────────────────
const VENUE_HERO_IMAGE_MAP: Record<string, string> = {
  青森: "/venues/hero/aomori-hero-mini.png",
  別府: "/venues/hero/beppu-hero-mini.png",
  岐阜: "/venues/hero/gifu-hero-mini.png",
  函館: "/venues/hero/hakodate-hero-mini.png",
  平塚: "/venues/hero/hiratsuka-hero-mini.png",
  防府: "/venues/hero/hofu-hero-mini.png",
  福井: "/venues/hero/fukui-hero-mini.png",
  いわき平: "/venues/hero/iwaki-taira-mini.png",
  川崎: "/venues/hero/kawasaki-hero-mini.png",
  京王閣: "/venues/hero/keiokaku-hero-mini.png",
  岸和田: "/venues/hero/kishiwada-hero-mini.png",
  小倉: "/venues/hero/kokura-hero-mini.png",
  小松島: "/venues/hero/komatsushima-hero-mini.png",
  高知: "/venues/hero/kochi-hero-mini.png",
  久留米: "/venues/hero/kurume-hero-mini.png",
  前橋: "/venues/hero/maebashi-hero-mini.png",
  松戸: "/venues/hero/matsudo-hero-mini.png",
  松阪: "/venues/hero/matsusaka-hero-mini.png",
  名古屋: "/venues/hero/nagoya-hero-mini.png",
  奈良: "/venues/hero/nara-hero-mini.png",
  小田原: "/venues/hero/odawara-hero-mini.png",
  大垣: "/venues/hero/ogaki-hero-mini.png",
  大宮: "/venues/hero/omiya-hero-mini.png",
  佐世保: "/venues/hero/sasebo-hero-mini.png",
  西武園: "/venues/hero/seibuen-hero-mini.png",
  静岡: "/venues/hero/shizuoka-hero-mini.png",
  立川: "/venues/hero/tachikawa-hero-mini.png",
  高松: "/venues/hero/takamatsu-hero-mini.png",
  武雄: "/venues/hero/takeo-hero-mini.png",
  玉野: "/venues/hero/tamano-hero-mini.png",
  取手: "/venues/hero/toride-hero-mini.png",
  富山: "/venues/hero/toyama-hero-mini.png",
  豊橋: "/venues/hero/toyohashi-hero-mini.png",
  宇都宮: "/venues/hero/utsunomiya-hero-mini.png",
  和歌山: "/venues/hero/wakayama-hero-mini.png",
  弥彦: "/venues/hero/yahiko-hero-mini.png",
  四日市: "/venues/hero/yokkaichi-hero-mini.png",
};

// ─── Default summary ────────────────────────────────────────────────────────────
const DEFAULT_VENUE_BANK_SUMMARY: VenueBankSummary = {
  bankLength: "確認中",
  feature: "会場特徴を整理中です。",
  target: "主導権と番手差しのバランスを見ながら組み立てたい。",
  caution: "当日の並びと気配を優先して確認したい。",
  source: "fallback",
};

// ─── Parser helpers (ported from RacesPage.tsx) ─────────────────────────────────
function toCompactSingleLine(value?: string | null): string {
  return (value ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[>*#-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function renderIwakiFallbackInline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      const boldMatch = part.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        return (
          <strong key={`iwaki-inline-${index}`} style={{ fontWeight: 800, color: "#182338" }}>
            {boldMatch[1]}
          </strong>
        );
      }
      return part;
    });
}

function renderIwakiFallbackMarkdown(markdown: string) {
  const splitSectionTitle = (value: string) => {
    const normalized = normalizeVenueMarkdownText(value);
    const match = normalized.match(/^([0-9]+(?:-[a-z])?\))\s*(.+)$/i);
    return {
      indexLabel: match?.[1] ?? "SECTION",
      title: match?.[2] ?? normalized,
    };
  };

  const sections: Array<{ title: string; blocks: ReactNode[] }> = [];
  let currentTitle = "分析メモ";
  let currentBlocks: ReactNode[] = [];
  let listItems: string[] = [];
  let tableLines: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    currentBlocks.push(
      <ul
        key={`iwaki-list-${sections.length}-${currentBlocks.length}`}
        style={{
          margin: 0,
          paddingLeft: "22px",
          display: "grid",
          gap: "12px",
          color: "#455468",
        }}
      >
        {listItems.map((item, index) => (
          <li
            key={`iwaki-list-item-${index}`}
            style={{
              fontSize: "13px",
              lineHeight: 2.02,
              paddingLeft: "2px",
            }}
          >
            {renderIwakiFallbackInline(normalizeVenueMarkdownText(item))}
          </li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  const flushTableLines = () => {
    if (tableLines.length === 0) return;
    const parsedTable = parseMarkdownTable(tableLines);
    currentBlocks.push(
      parsedTable ? (
        <div
          key={`iwaki-table-${sections.length}-${currentBlocks.length}`}
          style={{
            overflowX: "auto",
            borderRadius: "22px",
            border: "1px solid rgba(220,228,239,0.58)",
            background: "rgba(250,251,255,0.94)",
            padding: "12px",
          }}
        >
          <table
            style={{
              width: "100%",
              minWidth: "520px",
              borderCollapse: "collapse",
              background: "rgba(255,255,255,0.96)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <thead>
              <tr>
                {parsedTable.headers.map((header, index) => (
                  <th
                    key={`iwaki-th-${index}`}
                    style={{
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 800,
                      letterSpacing: "0.03em",
                      color: "#33465d",
                      background: "rgba(239,244,252,0.88)",
                      padding: "15px 18px",
                      borderBottom: "1px solid rgba(223,230,240,0.72)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedTable.rows.map((row, rowIndex) => (
                <tr key={`iwaki-tr-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`iwaki-td-${rowIndex}-${cellIndex}`}
                      style={{
                        fontSize: "12.5px",
                        lineHeight: 1.85,
                        color: "#526375",
                        padding: "15px 18px",
                        verticalAlign: "top",
                        whiteSpace: "pre-wrap",
                        borderBottom:
                          rowIndex === parsedTable.rows.length - 1
                            ? "none"
                            : "1px solid rgba(233,238,245,0.7)",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          key={`iwaki-table-${sections.length}-${currentBlocks.length}`}
          style={{
            borderRadius: "20px",
            border: "1px solid rgba(214,223,236,0.78)",
            background: "linear-gradient(180deg, rgba(241,246,255,0.92) 0%, rgba(248,250,255,0.98) 100%)",
            padding: "18px 18px",
            display: "grid",
            gap: "10px",
          }}
        >
          {tableLines.map((line, index) => (
            <div
              key={`iwaki-table-line-${index}`}
              style={{
                fontSize: index === 0 ? "12px" : "12.5px",
                lineHeight: 1.9,
                color: index === 0 ? "#223149" : "#536476",
                fontWeight: index === 0 ? 700 : 500,
                fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                whiteSpace: "pre-wrap",
              }}
            >
              {line}
            </div>
          ))}
        </div>
      ),
    );
    tableLines = [];
  };

  const flushSection = () => {
    flushList();
    flushTableLines();
    if (currentBlocks.length === 0) return;
    sections.push({ title: currentTitle, blocks: [...currentBlocks] });
    currentBlocks = [];
  };

  markdown.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      flushTableLines();
      return;
    }

    if (/^#\s+/.test(trimmed)) {
      return;
    }

    const sectionMatch = trimmed.match(/^##\s+(.+)$/);
    if (sectionMatch) {
      flushSection();
      currentTitle = normalizeVenueMarkdownText(sectionMatch[1]);
      return;
    }

    const subheadingMatch = trimmed.match(/^###\s+(.+)$/);
    if (subheadingMatch) {
      flushList();
      flushTableLines();
      currentBlocks.push(
        <h4
          key={`iwaki-subheading-${sections.length}-${currentBlocks.length}`}
          style={{
            margin: 0,
            fontSize: "16px",
            lineHeight: 1.55,
            fontWeight: 800,
            color: "#21314a",
            letterSpacing: "-0.01em",
            paddingTop: "4px",
          }}
        >
          {normalizeVenueMarkdownText(subheadingMatch[1])}
        </h4>,
      );
      return;
    }

    if (/^---+$/.test(trimmed)) {
      flushList();
      flushTableLines();
      currentBlocks.push(
        <div
          key={`iwaki-rule-${sections.length}-${currentBlocks.length}`}
          style={{
            height: "1px",
            background: "linear-gradient(90deg, rgba(140,99,199,0.18), rgba(142,183,228,0.18))",
          }}
        />,
      );
      return;
    }

    if (trimmed.includes("|") && trimmed.split("|").length >= 3) {
      flushList();
      tableLines.push(trimmed);
      return;
    }

    flushTableLines();

    const quoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushList();
      currentBlocks.push(
        <div
          key={`iwaki-quote-${sections.length}-${currentBlocks.length}`}
          style={{
            borderRadius: "18px",
            border: "1px solid rgba(205,217,236,0.8)",
            background: "linear-gradient(180deg, rgba(245,249,255,0.96) 0%, rgba(239,246,255,0.92) 100%)",
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              fontSize: "10px",
              fontWeight: 800,
              letterSpacing: "0.16em",
              color: "#6a82a5",
              marginBottom: "8px",
            }}
          >
            NOTE
          </div>
          <div style={{ fontSize: "13px", lineHeight: 1.95, color: "#4b5e78" }}>
            {renderIwakiFallbackInline(normalizeVenueMarkdownText(quoteMatch[1]))}
          </div>
        </div>,
      );
      return;
    }

    const listMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(listMatch[1]);
      return;
    }

    flushList();
    currentBlocks.push(
      <p
        key={`iwaki-paragraph-${sections.length}-${currentBlocks.length}`}
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: 2.08,
          color: "#4a5b70",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {renderIwakiFallbackInline(normalizeVenueMarkdownText(line))}
      </p>,
    );
  });

  flushSection();

  if (sections.length === 0) {
    return (
      <div
        style={{
          borderRadius: "18px",
          border: "1px solid rgba(221,228,239,0.88)",
          background: "rgba(255,255,255,0.92)",
          padding: "18px 18px",
        }}
      >
        <div style={{ fontSize: "13px", lineHeight: 1.95, color: "#334155", whiteSpace: "pre-wrap" }}>
          {renderIwakiFallbackInline(markdown)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      {sections.map((section, index) => (
        <section
          key={`${section.title}-${index}`}
          style={{
            position: "relative",
            borderRadius: "28px",
            border: "1px solid rgba(229,224,241,0.78)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(250,251,255,0.96) 100%)",
            padding: "28px 24px 26px",
            boxShadow: "0 10px 28px rgba(15,23,42,0.03)",
            display: "grid",
            gap: "18px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "0 auto auto 0",
              width: "160px",
              height: "160px",
              background: "radial-gradient(circle at top left, rgba(140,99,199,0.08), transparent 72%)",
              pointerEvents: "none",
            }}
          />
          <div style={{ display: "grid", gap: "10px", position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "10px",
              }}
            >
              <span
                style={{
                  fontSize: "26px",
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: "-0.05em",
                  color: "rgba(140,99,199,0.24)",
                }}
              >
                {splitSectionTitle(section.title).indexLabel}
              </span>
            </div>
            <div
              style={{
                width: "72px",
                height: "1px",
                background: "linear-gradient(90deg, rgba(140,99,199,0.42), rgba(148,181,225,0.18))",
              }}
            />
            <h3
              style={{
                margin: 0,
                fontSize: "28px",
                lineHeight: 1.32,
                fontWeight: 800,
                color: "#182338",
                letterSpacing: "-0.02em",
              }}
            >
              {splitSectionTitle(section.title).title}
            </h3>
          </div>
          <div style={{ display: "grid", gap: "16px", position: "relative" }}>{section.blocks}</div>
        </section>
      ))}
    </div>
  );
}

function clipVenueBankText(value: string, max = 78): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
}

function normalizeVenueBodyText(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => normalizeVenueMarkdownText(line))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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

function parseVenueBankSummary(markdown: string): VenueBankSummary {
  const summaryBlockMatch = markdown.match(/##\s*SUMMARY([\s\S]*?)(?=\n##\s|$)/i);
  const summaryBlock = summaryBlockMatch?.[1] ?? "";

  const fromSummary = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = summaryBlock.match(
      new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${escaped}\\s*[:：]\\s*(.+)`, "i"),
    );
    return toCompactSingleLine(match?.[1]);
  };

  const bankLength =
    fromSummary("バンク長") ||
    findFirstVenueBankLine(markdown, [
      /バンク長\s*[:：]\s*([^\n]+)/i,
      /会場[:：].*?[（(]\s*(\d{3,4})\s*[）)]/i,
    ]) ||
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

function normalizeVenueMarkdownText(value: string): string {
  return value
    .replace(/^>\s?/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\\$/g, "")
    .trim();
}

function parseMarkdownTableRow(line: string): string[] {
  const sanitized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return sanitized.split("|").map((cell) => normalizeVenueMarkdownText(cell.trim()));
}

function isMarkdownTableSeparator(line: string): boolean {
  const sanitized = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!sanitized.includes("-")) return false;
  return sanitized
    .split("|")
    .every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
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
      new RegExp(
        `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[:：]\\s*(.+)`,
        "m",
      ),
      new RegExp(
        `(?:^|\\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*[（(][^\\n]*[)）]\\s*[:：]?\\s*(.+)`,
        "m",
      ),
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

function parseVenueMarkdownDocument(markdown: string): VenueMarkdownDocument {
  const sections: VenueDetailSection[] = [];
  const meta = extractVenueMeta(markdown);
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  const documentTitle = titleMatch?.[1]
    ? normalizeVenueMarkdownText(titleMatch[1])
    : "会場分析ノート";
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

// ─── Tag helper ─────────────────────────────────────────────────────────────────
function deriveVenueTags(summary: VenueBankSummary): string[] {
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

// ─── Map hotspots — click area only ─────────────────────────────────────────────
const AREA_HOTSPOTS: Record<
  string,
  { left: string; top: string; width: string; height: string }
> = {
  "北海道・東北": { left: "64%", top:  "4%", width: "28%", height: "28%" },
  "関東":         { left: "56%", top: "34%", width: "16%", height: "16%" },
  "南関東":       { left: "56%", top: "50%", width: "18%", height: "14%" },
  "中部":         { left: "39%", top: "39%", width: "18%", height: "16%" },
  "近畿":         { left: "30%", top: "49%", width: "14%", height: "14%" },
  "中国":         { left: "17%", top: "46%", width: "16%", height: "15%" },
  "四国":         { left: "22%", top: "64%", width: "14%", height: "11%" },
  "九州":         { left:  "5%", top: "58%", width: "18%", height: "18%" },
};

// ─── Map label positions — display only ─────────────────────────────────────────
const AREA_LABEL_POSITIONS: Record<
  string,
  { left: string; top: string; transform?: string }
> = {
  "北海道・東北": { left: "72%", top: "40%", transform: "translate(-50%, -50%)" },
  "関東":         { left: "64%", top: "60%", transform: "translate(-50%, -50%)" },
  "南関東":       { left: "55%", top: "68%", transform: "translate(-50%, -50%)" },
  "中部":         { left: "45%", top: "60%", transform: "translate(-50%, -50%)" },
  "近畿":         { left: "35%", top: "65%", transform: "translate(-50%, -50%)" },
  "中国":         { left: "25%", top: "62%", transform: "translate(-50%, -50%)" },
  "四国":         { left: "25%", top: "72%", transform: "translate(-50%, -50%)" },
  "九州":         { left: "12%", top: "72%", transform: "translate(-50%, -50%)" },
};

// ─── Tag styles ───────────────────────────────────────────────────────────────
const TAG_STYLE_MAP: Record<string, { color: string; bg: string }> = {
  "先行注目":    { color: "#7a6448", bg: "rgba(148,120,80,0.06)"  },  // ウォームベージュ
  "差し注目":    { color: "#446080", bg: "rgba(68,100,140,0.06)"  },  // ミストブルー
  "捲り注意":    { color: "#6858a0", bg: "rgba(104,88,160,0.06)"  },  // ソフトラベンダー
  "波乱含み":    { color: "#7c526a", bg: "rgba(140,88,112,0.06)"  },  // ダスティモーブ
  "風向き注意":  { color: "#4a7068", bg: "rgba(72,112,104,0.06)"  },  // セージグリーン
  "ナイター変化": { color: "#4c5878", bg: "rgba(76,88,128,0.06)"  },  // ネイビーグレー
};

const BRAND_RADIUS_PANEL = "30px";
const BRAND_RADIUS_SECTION = "24px";
const BRAND_RADIUS_CARD = "16px";
const BRAND_BORDER = "1px solid rgba(223,217,236,0.42)";
const BRAND_BORDER_SOFT = "1px solid rgba(223,217,236,0.3)";
const BRAND_SHADOW = "0 6px 18px rgba(15,23,42,0.016)";
const BRAND_SHADOW_SOFT = "0 3px 10px rgba(15,23,42,0.012)";
const BRAND_PANEL_BG = "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(248,250,255,0.92) 100%)";
const BRAND_TABLE_LINE = "rgba(228,234,242,0.58)";

// ─── Component ─────────────────────────────────────────────────────────────────
export default function VenueFeaturesPage() {
  const [activeRegion, setActiveRegion] = useState<RegionType>("すべて");
  const [venueIndex, setVenueIndex] = useState<VenueBankIndexItem[]>([]);
  const [selectedVenueName, setSelectedVenueName] = useState<string>("");
  const [summaryMap, setSummaryMap] = useState<Record<string, VenueBankSummary>>({});
  const [selectedVenueMarkdown, setSelectedVenueMarkdown] = useState("");
  const [selectedVenueDocumentTitle, setSelectedVenueDocumentTitle] = useState("");
  const [selectedVenueSections, setSelectedVenueSections] = useState<VenueDetailSection[]>([]);
  const [selectedVenueMeta, setSelectedVenueMeta] = useState<VenueMetaEntry[]>([]);
  const [, setSelectedVenueParseFailed] = useState(false);
  const [selectedVenueDetailLoading, setSelectedVenueDetailLoading] = useState(false);
  const [selectedVenueDetailError, setSelectedVenueDetailError] = useState("");
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [imageErrorSet, setImageErrorSet] = useState<Set<string>>(new Set());
  const [activeQuickJumpId, setActiveQuickJumpId] = useState("");
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );
  const selectedVenueItem = venueIndex.find((item) => item.venueName === selectedVenueName);
  const selectedVenueFetchPath =
  selectedVenueName === "いわき平"
    ? toPublicPath("/data/venues/banks/iwaki-daira.md")
    : selectedVenueItem?.file
      ? toPublicPath(selectedVenueItem.file)
      : "";

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    setActiveQuickJumpId("");
  }, [selectedVenueName]);

  // ── Load index + pre-fetch all bank summaries on mount ────────────
  useEffect(() => {
    fetch(toPublicPath("/data/venues/banks/index.json"))
      .then((r) => r.json())
      .then((data: VenueBankIndexItem[]) => {
        setVenueIndex(data);
        if (data.length > 0) setSelectedVenueName(data[0].venueName);
        setLoadingIndex(false);
        data.forEach((item) => {
          fetch(toPublicPath(item.file))
            .then((r) => r.text())
            .then((md) =>
              setSummaryMap((prev) => ({
                ...prev,
                [item.venueName]: parseVenueBankSummary(md),
              })),
            )
            .catch(() =>
              setSummaryMap((prev) => ({
                ...prev,
                [item.venueName]: { ...DEFAULT_VENUE_BANK_SUMMARY },
              })),
            );
        });
      })
      .catch(() => setLoadingIndex(false));
  }, []);

  useEffect(() => {
    if (!selectedVenueName || !selectedVenueFetchPath) {
      setSelectedVenueMarkdown("");
      setSelectedVenueDocumentTitle("");
      setSelectedVenueSections([]);
      setSelectedVenueMeta([]);
      setSelectedVenueParseFailed(false);
      setSelectedVenueDetailError("");
      setSelectedVenueDetailLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedVenueDetailLoading(true);
    setSelectedVenueDetailError("");
    setSelectedVenueParseFailed(false);
    console.log("[detail] selectedVenueName", selectedVenueName);
    console.log("[detail] fetchPath", selectedVenueFetchPath);

    fetch(selectedVenueFetchPath)
      .then((response) => {
        if (!response.ok) throw new Error("failed-to-load-venue-detail");
        return response.text();
      })
      .then((markdown) => {
        if (cancelled) return;
        setSelectedVenueMarkdown(markdown);
        console.log("[VenueFeaturesPage] selectedVenueItem.file:", selectedVenueFetchPath);
        console.log("[VenueFeaturesPage] markdown preview:", markdown.slice(0, 200));

        if (selectedVenueName === "いわき平") {
          const titleMatch = markdown.match(/^#\s+(.+)$/m);
          setSelectedVenueDocumentTitle(
            titleMatch?.[1] ? normalizeVenueMarkdownText(titleMatch[1]) : selectedVenueName,
          );
          setSelectedVenueMeta([]);
          setSelectedVenueSections([]);
          setSelectedVenueParseFailed(true);
          console.log("[VenueFeaturesPage] parsed title:", titleMatch?.[1] ?? selectedVenueName);
          console.log("[VenueFeaturesPage] parsed sections.length:", 0);
          return;
        }

        try {
          const parsedDocument = parseVenueMarkdownDocument(markdown);
          console.log("[VenueFeaturesPage] parsed title:", parsedDocument.title);
          console.log("[VenueFeaturesPage] parsed meta.length:", parsedDocument.meta.length);
          console.log("[VenueFeaturesPage] parsed sections.length:", parsedDocument.sections.length);
          setSelectedVenueDocumentTitle(parsedDocument.title);
          setSelectedVenueSections(parsedDocument.sections);
          setSelectedVenueMeta(parsedDocument.meta);
          setSelectedVenueParseFailed(false);
        } catch (error) {
          console.error("[detail] parse failed", error);
          const titleMatch = markdown.match(/^#\s+(.+)$/m);
          setSelectedVenueDocumentTitle(
            titleMatch?.[1] ? normalizeVenueMarkdownText(titleMatch[1]) : selectedVenueName,
          );
          setSelectedVenueSections([]);
          setSelectedVenueMeta(extractVenueMeta(markdown));
          setSelectedVenueParseFailed(true);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[detail] load failed", error);
        setSelectedVenueMarkdown("");
        setSelectedVenueDocumentTitle("");
        setSelectedVenueSections([]);
        setSelectedVenueMeta([]);
        setSelectedVenueParseFailed(false);
        setSelectedVenueDetailError("会場詳細を読み込めませんでした。");
      })
      .finally(() => {
        if (!cancelled) setSelectedVenueDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVenueFetchPath, selectedVenueName]);

  const isMobile = windowWidth < 900;
  const ff = "'Helvetica Neue', Arial, 'Hiragino Sans', sans-serif";

  // ── Filtered list ──────────────────────────────────────────────────
  const filteredVenues =
    activeRegion === "すべて"
      ? venueIndex
      : venueIndex.filter((v) => VENUE_REGION_MAP[v.venueName] === activeRegion);

  // ── Region tab handler ─────────────────────────────────────────────
  const handleRegionChange = (region: RegionType) => {
    const filtered =
      region === "すべて"
        ? venueIndex
        : venueIndex.filter((v) => VENUE_REGION_MAP[v.venueName] === region);
    setActiveRegion(region);
    if (filtered.length > 0 && !filtered.some((v) => v.venueName === selectedVenueName)) {
      setSelectedVenueName(filtered[0].venueName);
    }
  };

  // ── Selected venue data ────────────────────────────────────────────
  const selectedSummary = summaryMap[selectedVenueName] ?? DEFAULT_VENUE_BANK_SUMMARY;
  const selectedRegion = VENUE_REGION_MAP[selectedVenueName] ?? "—";
  const selectedImage = VENUE_HERO_IMAGE_MAP[selectedVenueName]
  ? toPublicPath(VENUE_HERO_IMAGE_MAP[selectedVenueName])
  : "";
  const showFallbackImage = !selectedImage || imageErrorSet.has(selectedVenueName);
  const selectedTags = deriveVenueTags(selectedSummary);
  const selectedSpotlight = venueSpotlightData[selectedVenueName];
  const spotlightLead = selectedTags.includes("差し注目")
    ? "差し脚と風向きに注目したい会場。"
    : selectedTags.includes("先行注目")
      ? "主導権の取り方が流れを左右しやすいバンク。"
      : selectedTags.includes("風向き注意")
        ? "風向きと流れを丁寧に見ておきたい会場。"
        : "直線と流れを丁寧に見たい会場。";
  const spotlightFeatureCopy = selectedSummary.feature === "会場特徴を整理中です。"
    ? selectedTags.includes("差し注目")
      ? "番手差しと終いの伸びを丁寧に見たいバンク。"
      : selectedTags.includes("先行注目")
        ? "主導権の取り方で流れを見たい会場。"
        : selectedTags.includes("風向き注意")
          ? "風向き次第で狙い筋を見直したい会場。"
          : "最後の脚色を丁寧に見たい会場。"
    : selectedSummary.feature;
  const spotlightPoints = [
    {
      label: "主導権",
      text:
        selectedSpotlight?.pace ??
        (selectedTags.includes("先行注目")
          ? "踏み出しの速さと先行ラインの粘りに注目。"
          : "主導権争いが流れを左右しやすい。"),
    },
    {
      label: "差し脚",
      text:
        selectedSpotlight?.sashi ??
        (selectedTags.includes("差し注目")
          ? "番手差しと終いの伸びを丁寧に見たい。"
          : "最後に伸びる脚色を丁寧に見たい。"),
    },
    {
      label: "風向き",
      text:
        selectedSpotlight?.wind ??
        (selectedTags.includes("風向き注意")
          ? "風の向き次第で狙い筋が揺れやすい。"
          : "当日の空気感まで含めて見ておきたい。"),
    },
  ];
  const spotlightImageCaption =
    selectedSpotlight?.imageCaption ??
    (selectedTags.includes("風向き注意")
      ? "夜の気配と風向きで読み味が変わる。"
      : selectedTags.includes("波乱含み")
        ? "流れが一気に傾く瞬間を見ておきたい。"
        : selectedTags.includes("先行注目")
          ? "主導権の入り方まで静かに追いたい。"
          : "直前の空気感まで見ておきたい。");
  const showIwakiRawFallback =
    selectedVenueName === "いわき平" && !!selectedVenueMarkdown.trim();
  const detailMetaLabels = selectedVenueName === "いわき平"
    ? ["場名", "想定カテゴリ", "データ期間", "使用ソース", "周長", "見なし直線"]
    : ["場名", "最終更新日", "集計対象", "周長", "カント", "みなし直線"];
  const heroLabelFont = "Inter, 'Helvetica Neue', Arial, sans-serif";
  const heroTitleFont = "'Noto Serif JP', 'Zen Old Mincho', 'Hiragino Mincho ProN', serif";
  const heroBodyFont = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";

  // ── Right panel data ───────────────────────────────────────────────
  const panelVenues = filteredVenues.slice(0, 6);
  const panelDesc =
    activeRegion === "すべて"
      ? "気になる地域から会場を見比べられます。"
      : "この地域の会場を一覧で比較できます。";
  const useLargeVenueStack = activeRegion !== "すべて" && filteredVenues.length <= 4;
  const detailMetaEntries = detailMetaLabels.map((label) => ({
    label,
    value: selectedVenueMeta.find((entry) => entry.label === label)?.value ?? "記載なし",
  }));
  const splitDetailHeading = (value: string) => {
    const normalized = normalizeVenueMarkdownText(value);
    const match = normalized.match(/^([0-9]+(?:-[a-z])?\))\s*(.+)$/i);
    return {
      indexLabel: match?.[1] ?? "SECTION",
      title: match?.[2] ?? normalized,
    };
  };
  const getDetailSectionAnchorInfo = (value: string) => {
    const normalized = normalizeVenueMarkdownText(value);
    const sectionMatch = normalized.match(/^section\s+([0-9]+(?:-[a-z0-9]+)?)\)\s*(.*)$/i);
    if (sectionMatch) {
      const rawLabel = `${sectionMatch[1]})`;
      const groupMatch = sectionMatch[1].match(/^([0-9]+)/);
      const groupLabel = groupMatch ? `${groupMatch[1]})` : rawLabel;
      return {
        domId: `venue-detail-section-${sectionMatch[1].toLowerCase()}`,
        groupLabel,
        rawLabel,
      };
    }

    const regularMatch = normalized.match(/^([0-9]+(?:-[a-z0-9]+)?)\)\s*(.*)$/i);
    if (regularMatch) {
      return {
        domId: `venue-detail-section-${regularMatch[1].toLowerCase()}`,
        groupLabel: `${regularMatch[1].match(/^([0-9]+)/)?.[1] ?? regularMatch[1]})`,
        rawLabel: `${regularMatch[1]})`,
      };
    }

    return {
      domId: "venue-detail-section-section",
      groupLabel: "",
      rawLabel: "",
    };
  };
  const detailQuickJumpLabelMap: Record<string, string> = {
    "0": "メタ情報",
    "1": "バンク仕様",
    "2": "風のクセ",
    "3": "決まり手",
    "4": "傾向まとめ",
    "5": "グレード別対策",
    "6": "ライン戦術",
    "7": "10点フォーマット",
    "8": "チェックリスト",
    "9": "集計ビュー②",
    "10": "集計ビュー③",
    "11": "更新履歴",
  };
  const detailQuickJumpSections = (() => {
    const seen = new Set<string>();
    return selectedVenueSections.flatMap((section) => {
      const anchorInfo = getDetailSectionAnchorInfo(section.title);
      const sectionNumber = anchorInfo.groupLabel.replace(/\)$/, "");
      if (!(sectionNumber in detailQuickJumpLabelMap) || seen.has(sectionNumber)) return [];
      seen.add(sectionNumber);

      return [{
        id: anchorInfo.domId,
        indexLabel: `${sectionNumber})`,
        title: detailQuickJumpLabelMap[sectionNumber],
      }];
    });
  })();
  const detailTopAnchorId = "venue-detail-top-anchor";
  const handleQuickJumpClick = (targetId: string) => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(targetId);
    if (!element) return;
    setActiveQuickJumpId(targetId);
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleBackToTopClick = () => {
    if (typeof document === "undefined") return;
    const element = document.getElementById(detailTopAnchorId);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const detailHighlights = [
    { label: "狙いどころ", value: selectedSpotlight?.target ?? selectedSummary.target },
    { label: "注意したい点", value: selectedSpotlight?.caution ?? selectedSummary.caution },
    {
      label: "見どころ",
      value: selectedSpotlight?.bankCharacter ?? selectedSummary.feature,
    },
  ];
  const detailBodyTextMaxWidth = isMobile ? "100%" : "78ch";
  const detailValueLinePattern = /^([^:：]{1,24})\s*[:：]\s*(.+)$/;
  const detailSpecPattern = /^(周長|バンク長|カント|みなし直線|見なし直線|幅員|走路幅員|ホーム幅員|センター幅員)\s*[:：]/;
  const getSectionLines = (section: VenueDetailSection) => {
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
    return lines;
  };
  const getSectionInfoEntries = (section: VenueDetailSection) => {
    const seen = new Set<string>();
    return getSectionLines(section)
      .map((line) => {
        const match = line.match(detailValueLinePattern);
        if (!match) return null;
        const label = normalizeVenueMarkdownText(match[1]);
        const value = normalizeVenueMarkdownText(match[2]);
        if (!label || !value || seen.has(label)) return null;
        seen.add(label);
        return { label, value };
      })
      .filter((entry): entry is { label: string; value: string } => !!entry);
  };
  const getSectionInfoNotes = (section: VenueDetailSection) =>
    getSectionLines(section).filter((line) => !detailValueLinePattern.test(line));
  const getBankSpecValue = (
    section: VenueDetailSection,
    labels: string[],
    fallbackLabel?: string,
  ) => {
    for (const line of getSectionLines(section)) {
      const match = line.match(detailValueLinePattern);
      if (!match) continue;
      const label = normalizeVenueMarkdownText(match[1]);
      if (labels.includes(label)) return normalizeVenueMarkdownText(match[2]);
    }
    if (fallbackLabel) {
      return detailMetaEntries.find((entry) => entry.label === fallbackLabel)?.value ?? "記載なし";
    }
    return "記載なし";
  };
  const stripSpecText = (text: string) =>
    text
      .split(/\n+/)
      .map((line) => normalizeVenueMarkdownText(line))
      .filter((line) => line && !detailSpecPattern.test(line))
      .join("\n");
  const getSectionIntro = (section: VenueDetailSection) => {
    const firstParagraph = section.blocks.find(
      (block): block is Extract<VenueDetailBlock, { type: "paragraph" }> =>
        block.type === "paragraph" && block.text.trim().length > 0,
    );
    if (!firstParagraph) return "";
    return clipVenueBankText(firstParagraph.text.replace(/\s+/g, " ").trim(), 96);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#ffffff",
        fontFamily: ff,
      }}
    >
      {/* ── 1. Hero ────────────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "44px 16px 36px" : "44px 40px 36px", background: "linear-gradient(180deg, #f3efff 0%, #f9f7ff 100%)" }}>
        <div style={{ marginBottom: "20px" }}>
          <a
            href="#top"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 800,
              color: "#8c63c7",
              textDecoration: "none",
              borderRadius: "9999px",
              padding: "6px 15px",
              background: "rgba(242,236,251,0.75)",
              border: "1px solid rgba(224,214,244,0.5)",
              letterSpacing: "0.04em",
            }}
          >
            ← トップに戻る
          </a>
        </div>

        <div
          style={{
            backgroundImage: [
              "linear-gradient(135deg, rgba(255,255,255,0.84) 0%, rgba(248,243,255,0.78) 52%, rgba(239,245,255,0.76) 100%)",
              `url("${toPublicPath("/venue-features/venue-features-hero-bg-lavender-bloom.png")}")`,
            ].join(", "),
            backgroundSize: "100% auto",
            backgroundPosition: "right top",
            backgroundRepeat: "no-repeat",
            borderRadius: BRAND_RADIUS_PANEL,
            border: "1px solid rgba(214,205,236,0.22)",
            boxShadow: "0 4px 16px rgba(140,99,199,0.03)",
            minHeight: isMobile ? "252px" : "308px",
            padding: isMobile ? "40px 24px" : "60px 48px 54px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: isMobile ? "18px" : "52px",
              alignItems: "start",
              marginBottom: "24px",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 400,
                  letterSpacing: "0.34em",
                  color: "rgba(76, 69, 104, 0.56)",
                  marginBottom: "12px",
                  fontFamily: heroLabelFont,
                }}
              >
                BANK JOURNAL
              </div>
              <h1
                style={{
                  fontSize: isMobile ? "39px" : "60px",
                  fontWeight: 700,
                  lineHeight: 1.07,
                  letterSpacing: "-0.055em",
                  color: "#101726",
                  margin: 0,
                  fontFamily: heroTitleFont,
                  textWrap: "balance",
                }}
              >
                走りを変える、
                <br />
                バンクの個性。
              </h1>
            </div>
            <div>
              <div
                style={{
                  maxWidth: isMobile ? "100%" : "304px",
                  marginLeft: isMobile ? 0 : "auto",
                  paddingTop: isMobile ? "0" : "18px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "14px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: "22px",
                      height: "1px",
                      background: "rgba(112, 118, 138, 0.34)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 400,
                      letterSpacing: "0.28em",
                      color: "rgba(86, 93, 116, 0.58)",
                      fontFamily: heroLabelFont,
                    }}
                  >
                    EDITOR'S NOTE
                  </span>
                </div>
                <p
                  style={{
                    fontSize: "14px",
                    color: "#5f6b7d",
                    lineHeight: 1.98,
                    margin: 0,
                    maxWidth: "290px",
                    fontFamily: heroBodyFont,
                    letterSpacing: "0.01em",
                  }}
                >
                  直線、風、傾向、狙いどころ。
                  <br />
                  全国の競輪場を、静かに見比べる。
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "2px" }}>
            {[
              "バンクの個性を見比べる",
              "エリアから会場を探す",
              "狙い筋を静かに読む",
            ].map((chip) => (
              <span
                key={chip}
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "#667183",
                  background: "rgba(255,255,255,0.48)",
                  border: "1px solid rgba(136,128,164,0.12)",
                  borderRadius: "9999px",
                  padding: "6px 12px",
                  letterSpacing: "0.04em",
                  fontFamily: heroBodyFont,
                  backdropFilter: "blur(3px)",
                }}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Area Search ─────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "0 16px 40px" : "0 40px 40px", background: "#ffffff" }}>
        <div
          style={{
            borderRadius: BRAND_RADIUS_PANEL,
            border: BRAND_BORDER,
            background: BRAND_PANEL_BG,
            boxShadow: BRAND_SHADOW_SOFT,
            padding: isMobile ? "18px 14px 14px" : "18px 24px 16px",
          }}
        >
          <div style={{ marginBottom: isMobile ? "11px" : "10px" }}>
            <div
              style={{
                fontSize: "11px",
                fontWeight: 900,
                letterSpacing: "0.28em",
                color: "rgba(140,99,199,0.68)",
                marginBottom: "5px",
              }}
            >
              AREA SEARCH
            </div>
            <h2
              style={{
                fontSize: "22px",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                color: "#0c1426",
                margin: "0 0 4px",
              }}
            >
              エリアから会場を探す
            </h2>
            <p style={{ fontSize: "12.5px", color: "#647388", lineHeight: 1.72, margin: 0, maxWidth: "46ch" }}>
              地図から地域感をつかみ、気になる会場をそのまま比較できます。
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(434px, 472px)",
              gap: isMobile ? "13px" : "8px",
              alignItems: "start",
              marginBottom: "9px",
            }}
          >
            {/* Map */}
            <div
              style={{
                position: "relative",
                overflow: "visible",
                borderRadius: "20px",
                border: "1px solid rgba(223,217,236,0.18)",
                background: "linear-gradient(180deg, rgba(248,244,255,0.54) 0%, rgba(244,249,255,0.5) 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.34)",
                padding: isMobile ? "5px" : "5px 6px",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: isMobile ? "100%" : "980px",
                  margin: "0",
                  borderRadius: "16px",
                  overflow: "hidden",
                  lineHeight: 0,
                  padding: isMobile ? "1px" : "1px",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(248,248,255,0.42) 100%)",
                }}
              >
                <img
                  src={toPublicPath("/venue-features/venue-features-area-map-kurari-wide.png")}
                  alt="全国の競輪場エリアマップ"
                  style={{
                    width: "100%",
                    height: "auto",
                    display: "block",
                    objectFit: "contain",
                    borderRadius: "14px",
                    filter: "saturate(0.94)",
                  }}
                />

                {Object.entries(AREA_HOTSPOTS).map(([region, pos]) => {
                  const isActive = activeRegion === region;
                  const count = venueIndex.filter(
                    (v) => VENUE_REGION_MAP[v.venueName] === region,
                  ).length;
                  const labelPos = AREA_LABEL_POSITIONS[region];
                  return (
                    <Fragment key={region}>
                      <button
                        type="button"
                        title={`${region}（${count}会場）`}
                        onClick={() => handleRegionChange(region as RegionType)}
                        style={{
                          position: "absolute",
                          left: pos.left,
                          top: pos.top,
                          width: pos.width,
                          height: pos.height,
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          outline: "none",
                          padding: 0,
                          zIndex: 2,
                        }}
                      />
                      {isActive && (
                        <span
                          style={{
                            position: "absolute",
                            left: labelPos.left,
                            top: labelPos.top,
                            transform: labelPos.transform ?? "translate(-50%, -50%)",
                            width: "110px",
                            height: "44px",
                            borderRadius: "9999px",
                            background:
                              "radial-gradient(circle, rgba(140,99,199,0.18) 0%, rgba(140,99,199,0) 75%)",
                            pointerEvents: "none",
                            zIndex: 1,
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => handleRegionChange(region as RegionType)}
                        title={region}
                        style={{
                          position: "absolute",
                          left: labelPos.left,
                          top: labelPos.top,
                          transform: labelPos.transform ?? "translate(-50%, -50%)",
                          display: "inline-block",
                          fontSize: "13px",
                          fontWeight: isActive ? 900 : 700,
                          color: isActive ? "#6f5aa9" : "rgba(70,50,120,0.58)",
                          background: isActive
                            ? "rgba(255,255,255,0.88)"
                            : "rgba(255,255,255,0.72)",
                          border: isActive
                            ? "1px solid rgba(140,99,199,0.28)"
                            : "1px solid rgba(140,99,199,0.12)",
                          borderRadius: "9999px",
                          padding: isActive ? "6px 16px" : "6px 14px",
                          boxShadow: isActive
                            ? "0 0 0 6px rgba(140,99,199,0.06), 0 2px 8px rgba(140,99,199,0.12)"
                            : "0 1px 4px rgba(0,0,0,0.05)",
                          whiteSpace: "nowrap",
                          fontFamily: ff,
                          letterSpacing: "0.02em",
                          backdropFilter: "blur(2px)",
                          cursor: "pointer",
                          outline: "none",
                          zIndex: 3,
                        }}
                      >
                        {region}
                      </button>
                    </Fragment>
                  );
                })}
              </div>

              {windowWidth >= 1024 && (
                <div
                  style={{
                    position: "absolute",
                    right: windowWidth < 1280 ? "48px" : "10px",
                    bottom: windowWidth < 1280 ? "20px" : "5px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: windowWidth < 1280 ? "8px" : "10px",
                    zIndex: 4,
                    pointerEvents: "none",
                    userSelect: "none",
                  }}
                >
                  <img
                    src={toPublicPath("/venue-features/venue-features-map-side-select-bubble.png")}
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: windowWidth < 1280 ? "180px" : "250px",
                      height: "auto",
                      display: "block",
                        marginBottom: windowWidth < 1280 ? "-18px" : "-60px",
                      filter: "drop-shadow(0 8px 18px rgba(186, 160, 96, 0.18))",
                    }}
                  />

                  <img
                    src={toPublicPath("/venue-features/venue-features-map-side-kurari-charigon.png")}
                    alt=""
                    aria-hidden="true"
                    style={{
                      width: windowWidth < 1280 ? "170px" : "298px",
                      height: "auto",
                      display: "block",
                      filter: "drop-shadow(0 14px 22px rgba(108, 91, 156, 0.18))",
                    }}
                  />
                </div>
              )}
            </div>

            {/* Right panel */}
            <div
              style={{
                borderRadius: "30px",
                border: "1px solid rgba(205, 194, 229, 0.46)",
                background: "linear-gradient(160deg, rgba(247,241,255,0.9) 0%, rgba(242,248,255,0.88) 100%)",
                boxShadow: "0 7px 18px rgba(37, 26, 68, 0.035)",
                padding: isMobile ? "22px 18px 18px" : "26px 26px 20px",
                minHeight: undefined,
                display: "grid",
                alignContent: "start",
                gap: "11px",
                alignSelf: "start",
                height: "fit-content",
              }}
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 900,
                    letterSpacing: "0.24em",
                    color: "rgba(122,88,178,0.66)",
                  }}
                >
                  SELECTED AREA
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      fontSize: isMobile ? "24px" : "28px",
                      fontWeight: 900,
                      color: "#151c31",
                      letterSpacing: "-0.03em",
                      marginBottom: "0",
                      lineHeight: 1.06,
                    }}
                  >
                    {activeRegion === "すべて" ? "全エリア" : activeRegion}
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "fit-content",
                      fontSize: "11.5px",
                      color: "#6a5499",
                      fontWeight: 700,
                      marginBottom: "0",
                      padding: "6px 11px",
                      borderRadius: "9999px",
                      background: "rgba(255,255,255,0.74)",
                      border: "1px solid rgba(170,146,214,0.22)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.75)",
                    }}
                  >
                    {filteredVenues.length} 会場
                  </div>
                </div>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "#5d6a7d",
                  lineHeight: 1.76,
                  margin: "0",
                  maxWidth: "32ch",
                }}
              >
                {panelDesc}
              </p>
              <div
                style={{
                  borderRadius: "24px",
                  border: "1px solid rgba(214, 207, 234, 0.52)",
                  background: "linear-gradient(180deg, rgba(255,255,255,0.84) 0%, rgba(250,247,255,0.78) 100%)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.68)",
                  padding: isMobile ? "12px" : "14px 14px 12px",
                  display: "grid",
                  gap: useLargeVenueStack ? "11px" : "9px",
                  alignContent: "start",
                }}
              >
                {panelVenues.map((v) => (
                  <button
                    key={v.venueKey}
                    type="button"
                    onClick={() => setSelectedVenueName(v.venueName)}
                    style={{
                      width: "100%",
                      minHeight: useLargeVenueStack ? "78px" : "62px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      fontSize: useLargeVenueStack ? "24px" : "20px",
                      fontWeight: v.venueName === selectedVenueName ? 800 : 700,
                      color:
                        v.venueName === selectedVenueName ? "#5f4795" : "#324055",
                      background:
                        v.venueName === selectedVenueName
                          ? "linear-gradient(180deg, rgba(236,225,255,0.94) 0%, rgba(227,238,255,0.92) 100%)"
                          : "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(250,251,255,0.9) 100%)",
                      border:
                        v.venueName === selectedVenueName
                          ? "1.5px solid rgba(144,106,202,0.34)"
                          : "1px solid rgba(202,197,218,0.48)",
                      borderRadius: "9999px",
                      padding: useLargeVenueStack ? "16px 24px" : "13px 20px",
                      cursor: "pointer",
                      outline: "none",
                      whiteSpace: "normal",
                      fontFamily: ff,
                      lineHeight: 1.12,
                      letterSpacing: "-0.01em",
                      boxShadow:
                        v.venueName === selectedVenueName
                          ? "0 8px 16px rgba(131, 101, 191, 0.11)"
                          : "0 3px 10px rgba(15,23,42,0.04)",
                      transition: "transform 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease",
                    }}
                    onMouseEnter={(event) => {
                      event.currentTarget.style.transform = "translateY(-1px)";
                      event.currentTarget.style.boxShadow =
                        v.venueName === selectedVenueName
                          ? "0 10px 20px rgba(131, 101, 191, 0.14)"
                          : "0 6px 14px rgba(15,23,42,0.07)";
                    }}
                    onMouseLeave={(event) => {
                      event.currentTarget.style.transform = "translateY(0)";
                      event.currentTarget.style.boxShadow =
                        v.venueName === selectedVenueName
                          ? "0 8px 16px rgba(131, 101, 191, 0.11)"
                          : "0 3px 10px rgba(15,23,42,0.04)";
                    }}
                  >
                    {v.venueName}
                  </button>
                ))}
                {filteredVenues.length > 6 && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#8f9db1",
                      padding: "2px 4px 0",
                      textAlign: "center",
                      lineHeight: 1.4,
                    }}
                  >
                    +{filteredVenues.length - 6}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Supplementary pills */}
          <div
            style={{
              display: "flex",
              gap: "10px 12px",
              flexWrap: "wrap",
              alignItems: "center",
              marginTop: isMobile ? "0" : "1px",
              padding: isMobile ? "6px 9px" : "7px 10px",
              borderRadius: "20px",
              border: "1px solid rgba(223,217,236,0.22)",
              background: "linear-gradient(180deg, rgba(255,255,255,0.44) 0%, rgba(248,247,255,0.4) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.42)",
            }}
          >
            {(REGIONS as readonly RegionType[]).map((region) => {
              const isActive = activeRegion === region;
              return (
                <button
                  key={region}
                  onClick={() => handleRegionChange(region)}
                  style={{
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "36px",
                    padding: "0 18px",
                    borderRadius: "9999px",
                    border: isActive
                      ? "1.5px solid rgba(173,135,228,0.66)"
                      : "1px solid rgba(214,208,231,0.62)",
                    background: isActive
                      ? "linear-gradient(135deg, rgba(232,216,250,0.92) 0%, rgba(219,233,252,0.88) 100%)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.86) 0%, rgba(249,249,255,0.78) 100%)",
                    color: isActive ? "#64429f" : "#7f8b9a",
                    fontWeight: isActive ? 700 : 600,
                    fontSize: "13.5px",
                    lineHeight: 1,
                    letterSpacing: "0.02em",
                    outline: "none",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                    boxShadow: isActive ? "0 3px 8px rgba(140,99,199,0.1)" : "0 1px 2px rgba(15,23,42,0.025)",
                  }}
                >
                  {region}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── 3. Venue Spotlight ─────────────────────────────────────── */}
      {selectedVenueName && (
        <section style={{ padding: isMobile ? "36px 16px 56px" : "44px 40px 56px", background: "linear-gradient(180deg, #edf2ff 0%, #f4f0ff 100%)" }}>

          {/* Section eyebrow */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "36px" }}>
            <div
              style={{
                width: "28px",
                height: "1px",
                background: "rgba(140,99,199,0.35)",
              }}
            />
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.34em",
                color: "rgba(140,99,199,0.55)",
                textTransform: "uppercase",
              }}
            >
              Venue Spotlight
            </div>
          </div>

          <div
            style={{
              borderRadius: BRAND_RADIUS_PANEL,
              border: BRAND_BORDER,
              background: "linear-gradient(135deg, #ffffff 0%, #f9f4ff 55%, #f0f7ff 100%)",
              boxShadow: BRAND_SHADOW,
              padding: isMobile ? "24px 16px" : "30px 30px",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.12fr) minmax(312px, 356px)",
              gap: isMobile ? "22px" : "30px",
              alignItems: "start",
            }}
          >
            {/* Left */}
            <div
              style={{
                minWidth: 0,
                display: "grid",
                alignContent: "start",
                gap: "2px",
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? "34px" : "42px",
                  fontWeight: 900,
                  lineHeight: 1.08,
                  letterSpacing: "-0.03em",
                  color: "#0c1426",
                  marginBottom: "8px",
                }}
              >
                {selectedVenueName}
              </div>

              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: "16.5px",
                  lineHeight: 1.76,
                  color: "#7b8797",
                  letterSpacing: "0.01em",
                  maxWidth: isMobile ? "100%" : "34ch",
                }}
              >
                {selectedSpotlight?.lead ?? spotlightLead}
              </p>

              {/* Tags row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flexWrap: "wrap",
                  marginBottom: "13px",
                  paddingBottom: "10px",
                  borderBottom: "1px solid rgba(180,160,220,0.12)",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#8c63c7",
                    background: "rgba(140,99,199,0.08)",
                    padding: "3px 11px",
                    borderRadius: "9999px",
                  }}
                >
                  {selectedRegion}
                </span>
                {selectedSummary.bankLength !== "確認中" && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#6a7888",
                      background: "rgba(82,96,114,0.06)",
                      padding: "3px 11px",
                      borderRadius: "9999px",
                    }}
                  >
                    {selectedSummary.bankLength}
                  </span>
                )}
                {selectedTags.map((tag) => {
                  const ts = TAG_STYLE_MAP[tag] ?? { color: "#526072", bg: "rgba(82,96,114,0.08)" };
                  return (
                    <span
                      key={tag}
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        color: ts.color,
                        background: ts.bg,
                        padding: "3px 10px",
                        borderRadius: "9999px",
                      }}
                    >
                      {tag}
                    </span>
                  );
                })}
              </div>

              {/* Main feature card */}
              <div
                style={{
                  position: "relative",
                  borderRadius: BRAND_RADIUS_CARD,
                  borderLeft: "1px solid rgba(140,99,199,0.16)",
                  background: "linear-gradient(180deg, rgba(250,246,255,0.42) 0%, rgba(248,244,255,0.24) 100%)",
                  padding: "14px 15px 14px 14px",
                  marginBottom: "9px",
                  width: "100%",
                  overflow: "hidden",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: "0 0 auto 0",
                    height: "20px",
                    background: "linear-gradient(90deg, rgba(140,99,199,0.08), rgba(160,185,226,0.04) 58%, rgba(255,255,255,0))",
                    pointerEvents: "none",
                  }}
                />
                <div
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 800,
                    letterSpacing: "0.2em",
                    color: "rgba(140,99,199,0.42)",
                    marginBottom: "9px",
                    textTransform: "uppercase",
                    position: "relative",
                  }}
                >
                  Bank Character
                </div>
                <p
                  style={{
                    fontSize: "17px",
                    lineHeight: 1.78,
                    color: "#1a2035",
                    margin: 0,
                    fontWeight: 400,
                    letterSpacing: "0.01em",
                    position: "relative",
                  }}
                >
                  {selectedSpotlight?.bankCharacter ?? spotlightFeatureCopy}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                  gap: "12px",
                  width: "100%",
                  marginBottom: "12px",
                }}
              >
                {spotlightPoints.map((point) => (
                  <div
                    key={point.label}
                    style={{
                      borderRadius: BRAND_RADIUS_CARD,
                      border: "1px solid rgba(168,177,214,0.18)",
                      background: "linear-gradient(180deg, rgba(246,244,255,0.72) 0%, rgba(241,247,255,0.54) 100%)",
                      padding: "13px 12px 14px",
                      display: "grid",
                      alignContent: "start",
                      gap: "7px",
                      minHeight: isMobile ? undefined : "116px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        color: "rgba(116,103,172,0.72)",
                        textTransform: "uppercase",
                      }}
                    >
                      {point.label}
                    </div>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "15px",
                        lineHeight: 1.72,
                        color: "#5e6c7d",
                      }}
                    >
                      {point.text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Sub cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                  gap: "12px",
                  width: "100%",
                  marginTop: "0",
                }}
              >
                <div
                  style={{
                    borderRadius: BRAND_RADIUS_CARD,
                    border: "1px solid rgba(61,114,176,0.025)",
                    background: "rgba(240,247,255,0.24)",
                    padding: "13px 13px 14px",
                    minHeight: isMobile ? undefined : "124px",
                    display: "grid",
                    alignContent: "start",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      color: "rgba(61,114,176,0.78)",
                      marginBottom: "8px",
                      textTransform: "uppercase",
                    }}
                  >
                    Target
                  </div>
                  <p
                    style={{
                      fontSize: "15px",
                      lineHeight: 1.74,
                      color: "#293548",
                      margin: 0,
                    }}
                  >
                    {selectedSpotlight?.target ?? selectedSummary.target}
                  </p>
                </div>
                <div
                  style={{
                    borderRadius: BRAND_RADIUS_CARD,
                    border: "1px solid rgba(176,96,64,0.025)",
                    background: "rgba(255,248,244,0.24)",
                    padding: "13px 13px 14px",
                    minHeight: isMobile ? undefined : "124px",
                    display: "grid",
                    alignContent: "start",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      color: "rgba(176,96,64,0.78)",
                      marginBottom: "8px",
                      textTransform: "uppercase",
                    }}
                  >
                    Caution
                  </div>
                  <p
                    style={{
                      fontSize: "15px",
                      lineHeight: 1.74,
                      color: "#293548",
                      margin: 0,
                    }}
                  >
                    {selectedSpotlight?.caution ?? selectedSummary.caution}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: image */}
            <div
              style={{
                width: "100%",
                maxWidth: isMobile ? "100%" : "356px",
                justifySelf: isMobile ? "stretch" : "center",
              }}
            >
              {showFallbackImage ? (
                <div
                  style={{
                    width: "100%",
                    height: "212px",
                    borderRadius: BRAND_RADIUS_SECTION,
                    background: "linear-gradient(135deg, #ede5f8 0%, #ddeaf8 100%)",
                    border: BRAND_BORDER_SOFT,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "34px",
                      fontWeight: 900,
                      letterSpacing: "-0.03em",
                      color: "rgba(90,60,160,0.10)",
                    }}
                  >
                    {selectedVenueName}
                  </span>
                </div>
              ) : (
                <img
                  src={selectedImage}
                  alt={selectedVenueName}
                  onError={() =>
                    setImageErrorSet((prev) => new Set([...prev, selectedVenueName]))
                  }
                  style={{
                    width: "100%",
                    height: "212px",
                    objectFit: "cover",
                    borderRadius: BRAND_RADIUS_SECTION,
                    border: BRAND_BORDER_SOFT,
                    display: "block",
                  }}
                />
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  marginTop: "11px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "1px",
                    background: "rgba(160,140,190,0.3)",
                  }}
                />
                <span
                  style={{
                    fontSize: "10.5px",
                    color: "#aeb8c6",
                    letterSpacing: "0.16em",
                    fontWeight: 600,
                  }}
                >
                  Bank view / {selectedVenueName}
                </span>
                <span
                  style={{
                    display: "inline-block",
                    width: "16px",
                    height: "1px",
                    background: "rgba(160,140,190,0.3)",
                  }}
                />
              </div>
              <p
                style={{
                  margin: "7px 0 0",
                  fontSize: "11.5px",
                  lineHeight: 1.7,
                  color: "#97a5b5",
                  textAlign: "center",
                  letterSpacing: "0.01em",
                }}
              >
                {spotlightImageCaption}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── 5. Venue Detail ─────────────────────────────────────── */}
      {selectedVenueName && (
        <section style={{ padding: isMobile ? "0 16px 52px" : "0 40px 52px", background: "#ffffff" }}>
          <div
            style={{
              borderRadius: BRAND_RADIUS_PANEL,
              border: BRAND_BORDER,
              background: "linear-gradient(180deg, #fdfcff 0%, #f8fafe 100%)",
              boxShadow: BRAND_SHADOW,
              padding: isMobile ? "26px 20px" : "34px 30px 38px",
              overflow: "hidden",
              maxWidth: "1320px",
              margin: "0 auto",
            }}
          >
            <div style={{ marginBottom: "24px" }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "26px",
                    height: "1px",
                    background: "rgba(140,99,199,0.28)",
                  }}
                />
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    letterSpacing: "0.28em",
                    color: "rgba(140,99,199,0.6)",
                    fontFamily: heroLabelFont,
                  }}
                >
                  VENUE NOTES
                </span>
              </div>
              <div
                style={{
                  fontSize: isMobile ? "29px" : "36px",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                  color: "#142033",
                  marginBottom: "10px",
                  lineHeight: 1.24,
                }}
              >
                {selectedVenueDocumentTitle || selectedVenueName}
              </div>
              <p
                style={{
                  fontSize: "12.5px",
                  lineHeight: 1.82,
                  color: "#7a8898",
                  margin: 0,
                  maxWidth: "520px",
                }}
              >
                会場ごとの特徴を、読みやすいノート形式で整理しています。
              </p>
            </div>

            {selectedVenueDetailLoading ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(221,214,239,0.52)",
                  background: "linear-gradient(180deg, #fbf9ff 0%, #f8fbff 100%)",
                  padding: isMobile ? "22px 18px" : "24px 24px",
                  fontSize: "14px",
                  color: "#6c7b8d",
                }}
              >
                会場詳細を読み込み中…
              </div>
            ) : selectedVenueDetailError ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(224,208,208,0.62)",
                  background: "linear-gradient(180deg, #fffafa 0%, #fffefe 100%)",
                  padding: isMobile ? "22px 18px" : "24px 24px",
                  fontSize: "14px",
                  color: "#8a5d5d",
                }}
              >
                {selectedVenueDetailError}
              </div>
            ) : showIwakiRawFallback ? (
              <div style={{ minWidth: 0, display: "grid", gap: "18px", justifyItems: "start" }}>
                <div
                  style={{
                    width: "100%",
                    maxWidth: "980px",
                    borderRadius: BRAND_RADIUS_SECTION,
                    border: BRAND_BORDER_SOFT,
                    background: "rgba(255,255,255,0.54)",
                    padding: isMobile ? "22px 18px" : "26px 26px 28px",
                  }}
                >
                  <div style={{ display: "grid", gap: "8px", marginBottom: "16px" }}>
                    <p
                      style={{
                        margin: 0,
                        maxWidth: "54ch",
                        fontSize: "13.5px",
                        lineHeight: 1.9,
                        color: "#637389",
                      }}
                    >
                      raw markdown を静かな読み幅で整え、情報の流れが追いやすい形にしています。
                    </p>
                  </div>

                  <div style={{ width: "100%", maxWidth: "820px" }}>
                    {renderIwakiFallbackMarkdown(selectedVenueMarkdown)}
                  </div>
                </div>
              </div>
            ) : !selectedVenueMarkdown.trim() || selectedVenueSections.length === 0 ? (
              <div
                style={{
                  borderRadius: "18px",
                  border: "1px solid rgba(221,214,239,0.52)",
                  background: "linear-gradient(180deg, #fbf9ff 0%, #f8fbff 100%)",
                  padding: isMobile ? "22px 18px" : "24px 24px",
                  fontSize: "14px",
                  color: "#6c7b8d",
                }}
              >
                この会場の詳細データは準備中です。
              </div>
            ) : (
              <div style={{ display: "grid", gap: isMobile ? "18px" : "22px" }}>
                <div
                  style={{
                    display: "grid",
                    gap: isMobile ? "12px" : "14px",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      borderRadius: BRAND_RADIUS_SECTION,
                      border: BRAND_BORDER_SOFT,
                      background: "rgba(255,255,255,0.6)",
                      padding: isMobile ? "16px 14px" : "18px 18px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.18em",
                        color: "rgba(140,99,199,0.56)",
                      }}
                    >
                      THIS VENUE AT A GLANCE
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                        gap: "10px",
                      }}
                    >
                      {detailHighlights.map((item) => (
                        <div
                          key={item.label}
                          style={{
                            borderRadius: BRAND_RADIUS_CARD,
                            border: "1px solid rgba(220,225,238,0.62)",
                            background: "linear-gradient(180deg, rgba(255,255,255,0.88) 0%, rgba(248,250,255,0.82) 100%)",
                            padding: "12px 13px",
                            display: "grid",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              fontSize: "10px",
                              fontWeight: 800,
                              letterSpacing: "0.12em",
                              color: "#7b88a0",
                            }}
                          >
                            {item.label}
                          </div>
                          <div
                            style={{
                              fontSize: "13px",
                              lineHeight: 1.78,
                              color: "#334156",
                            }}
                          >
                            {item.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div
                    id={detailTopAnchorId}
                    style={{
                      display: "grid",
                      gap: "8px",
                      borderRadius: BRAND_RADIUS_SECTION,
                      border: "1px solid rgba(223,217,236,0.2)",
                      background: "rgba(255,255,255,0.38)",
                      padding: isMobile ? "12px 12px" : "13px 14px",
                      scrollMarginTop: "24px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 700,
                        letterSpacing: "0.18em",
                        color: "rgba(140,99,199,0.5)",
                      }}
                    >
                      QUICK JUMP
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {detailQuickJumpSections.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleQuickJumpClick(item.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            borderRadius: "9999px",
                            border: item.id === activeQuickJumpId
                              ? "1px solid rgba(166,145,210,0.5)"
                              : "1px solid rgba(215,209,233,0.54)",
                            background: item.id === activeQuickJumpId
                              ? "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(245,241,255,0.92) 100%)"
                              : "linear-gradient(180deg, rgba(255,255,255,0.82) 0%, rgba(250,249,255,0.72) 100%)",
                            padding: isMobile ? "6px 10px" : "6px 11px",
                            color: item.id === activeQuickJumpId ? "#3e4d62" : "#5d6b7d",
                            fontSize: "11px",
                            lineHeight: 1.15,
                            boxShadow: item.id === activeQuickJumpId ? "0 2px 8px rgba(140,99,199,0.08)" : "none",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            appearance: "none",
                            backgroundClip: "padding-box",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 800,
                              color: item.id === activeQuickJumpId ? "#7459ab" : "#8d79bb",
                            }}
                          >
                            {item.indexLabel}
                          </span>
                          <span>{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ minWidth: 0, display: "grid", gap: "18px", justifyItems: "start", justifyContent: "center" }}>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "980px",
                      borderRadius: BRAND_RADIUS_SECTION,
                      border: BRAND_BORDER_SOFT,
                      background: "rgba(255,255,255,0.54)",
                      padding: isMobile ? "22px 18px" : "26px 26px 28px",
                    }}
                  >
                    <div style={{ display: "grid", gap: "8px", marginBottom: "18px" }}>
                      <p
                        style={{
                          margin: 0,
                          maxWidth: "54ch",
                          fontSize: "13.5px",
                          lineHeight: 1.9,
                          color: "#637389",
                        }}
                      >
                        本文を主役にしながら、補足情報は左側に静かにまとめています。
                      </p>
                    </div>

                    <div style={{ width: "100%", maxWidth: "820px", display: "grid", gap: "24px" }}>
                  {selectedVenueSections.map((section, sectionIndex) => (
                    (() => {
                      const heading = splitDetailHeading(section.title);
                      const isMetaSection = heading.indexLabel === "0)";
                      const isSpecSection = heading.indexLabel === "1)";
                      const isCompactSection = heading.indexLabel === "9)" || heading.indexLabel === "10)";
                      const introText = getSectionIntro(section);
                      const metaEntries = getSectionInfoEntries(section);
                      const metaNotes = getSectionInfoNotes(section);
                      const specCards = [
                        { label: "周長", value: getBankSpecValue(section, ["周長", "バンク長"], "周長") },
                        { label: "カント", value: getBankSpecValue(section, ["カント"], "カント") },
                        { label: "みなし直線", value: getBankSpecValue(section, ["みなし直線", "見なし直線"], "みなし直線") },
                      ].filter((item) => item.value && item.value !== "記載なし");
                      const articleBody = (
                        <div style={{ display: "grid", gap: isMetaSection ? "16px" : "18px", position: "relative", width: "100%" }}>
                          {isMetaSection ? (
                            <div style={{ display: "grid", gap: "14px" }}>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                                  gap: "10px",
                                }}
                              >
                                {metaEntries.map((entry) => (
                                  <div
                                    key={entry.label}
                                    style={{
                                      borderRadius: BRAND_RADIUS_CARD,
                                      border: "1px solid rgba(220,226,238,0.78)",
                                      background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,255,0.84) 100%)",
                                      padding: "13px 14px",
                                      display: "grid",
                                      gap: "6px",
                                      gridColumn:
                                        /前提|集計対象|データ期間|使用ソース/.test(entry.label) && !isMobile ? "1 / -1" : undefined,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: 800,
                                        letterSpacing: "0.12em",
                                        color: "#7d8aa0",
                                      }}
                                    >
                                      {entry.label}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        lineHeight: 1.78,
                                        color: "#314157",
                                        whiteSpace: "pre-wrap",
                                      }}
                                    >
                                      {entry.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {metaNotes.length > 0 && (
                                <div
                                  style={{
                                    borderRadius: BRAND_RADIUS_CARD,
                                    border: "1px solid rgba(223,229,239,0.72)",
                                    background: "rgba(248,250,255,0.76)",
                                    padding: "14px 15px",
                                    display: "grid",
                                    gap: "8px",
                                  }}
                                >
                                  {metaNotes.map((note, noteIndex) => (
                                    <p
                                      key={`${section.title}-meta-note-${noteIndex}`}
                                      style={{
                                        margin: 0,
                                        fontSize: "13px",
                                        lineHeight: 1.86,
                                        color: "#506175",
                                      }}
                                    >
                                      {note}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              {isSpecSection && specCards.length > 0 && (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                                    gap: "10px",
                                  }}
                                >
                                  {specCards.map((card) => (
                                    <div
                                      key={card.label}
                                      style={{
                                        borderRadius: BRAND_RADIUS_CARD,
                                        border: "1px solid rgba(218,224,236,0.78)",
                                        background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(248,250,255,0.84) 100%)",
                                        padding: "14px 15px",
                                        display: "grid",
                                        gap: "6px",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "10px",
                                          fontWeight: 800,
                                          letterSpacing: "0.12em",
                                          color: "#7a88a0",
                                        }}
                                      >
                                        {card.label}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "22px",
                                          lineHeight: 1.2,
                                          fontWeight: 800,
                                          color: "#21314a",
                                          letterSpacing: "-0.02em",
                                        }}
                                      >
                                        {card.value}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {section.blocks.map((block, blockIndex) => {
                                if (!isMetaSection && !isSpecSection && block.type === "paragraph" && blockIndex === section.blocks.findIndex((candidate) => candidate.type === "paragraph" && candidate.text.trim())) {
                                  return null;
                                }

                                if (block.type === "paragraph") {
                                  const paragraphText = normalizeVenueBodyText(
                                    isSpecSection ? stripSpecText(block.text) : block.text,
                                  );
                                  if (!paragraphText.trim()) return null;
                                  return (
                                    <p
                                      key={`${section.title}-p-${blockIndex}`}
                                      style={{
                                        fontSize: "13.5px",
                                        lineHeight: 2.02,
                                        color: "#4b5c71",
                                        margin: 0,
                                        whiteSpace: "normal",
                                        wordBreak: "normal",
                                        overflowWrap: "break-word",
                                        width: "100%",
                                        maxWidth: detailBodyTextMaxWidth,
                                      }}
                                    >
                                      {paragraphText}
                                    </p>
                                  );
                                }

                                if (block.type === "subheading") {
                                  return (
                                    <h4
                                      key={`${section.title}-s-${blockIndex}`}
                                      style={{
                                        fontSize: "20px",
                                        fontWeight: 800,
                                        color: "#1e2e46",
                                        lineHeight: 1.52,
                                        margin: 0,
                                        paddingTop: "10px",
                                      }}
                                    >
                                      {block.text}
                                    </h4>
                                  );
                                }

                                if (block.type === "quote") {
                                  const quoteText = normalizeVenueBodyText(block.text);
                                  if (!quoteText) return null;
                                  return (
                                    <div
                                      key={`${section.title}-q-${blockIndex}`}
                                      style={{
                                        borderRadius: BRAND_RADIUS_CARD,
                                        border: "1px solid rgba(203,216,235,0.58)",
                                        background: "linear-gradient(180deg, rgba(244,248,255,0.9) 0%, rgba(239,245,255,0.82) 100%)",
                                        padding: "16px 18px",
                                        width: "100%",
                                        maxWidth: detailBodyTextMaxWidth,
                                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.72)",
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontSize: "10px",
                                          fontWeight: 800,
                                          letterSpacing: "0.16em",
                                          color: "#6980a1",
                                          marginBottom: "8px",
                                        }}
                                      >
                                        INSIGHT
                                      </div>
                                      <div
                                        style={{
                                          fontSize: "13.5px",
                                          lineHeight: 1.94,
                                          color: "#4e6078",
                                          whiteSpace: "normal",
                                          wordBreak: "normal",
                                          overflowWrap: "break-word",
                                        }}
                                      >
                                        {quoteText}
                                      </div>
                                    </div>
                                  );
                                }

                                if (block.type === "rule") {
                                  return (
                                    <div
                                      key={`${section.title}-r-${blockIndex}`}
                                      style={{
                                        height: "1px",
                                        background: "linear-gradient(90deg, rgba(140,99,199,0.18), rgba(160,185,226,0.18))",
                                      }}
                                    />
                                  );
                                }

                                if (block.type === "checklist") {
                                  return (
                                    <div
                                      key={`${section.title}-c-${blockIndex}`}
                                      style={{
                                        display: "grid",
                                        gap: "14px",
                                        borderRadius: BRAND_RADIUS_CARD,
                                        border: "1px solid rgba(219,228,238,0.34)",
                                        background: "rgba(248,251,255,0.62)",
                                        padding: "14px 15px",
                                        width: "100%",
                                        maxWidth: detailBodyTextMaxWidth,
                                      }}
                                    >
                                      {block.items.map((item, itemIndex) => (
                                        <div
                                          key={`${section.title}-ci-${blockIndex}-${itemIndex}`}
                                          style={{
                                            display: "grid",
                                            gridTemplateColumns: "18px 1fr",
                                            gap: "10px",
                                            alignItems: "start",
                                            minWidth: 0,
                                          }}
                                        >
                                          <span
                                            style={{
                                              width: "18px",
                                              height: "18px",
                                              borderRadius: "50%",
                                              background: item.checked ? "#9a7bd1" : "rgba(152,168,188,0.18)",
                                              color: item.checked ? "#ffffff" : "transparent",
                                              display: "inline-flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              fontSize: "11px",
                                              fontWeight: 800,
                                            }}
                                          >
                                            ✓
                                          </span>
                                          <span
                                            style={{
                                              fontSize: "13.5px",
                                              lineHeight: 1.96,
                                              color: "#4b5a6d",
                                              minWidth: 0,
                                              whiteSpace: "normal",
                                              wordBreak: "normal",
                                              overflowWrap: "break-word",
                                            }}
                                          >
                                            {normalizeVenueBodyText(item.text)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }

                                if (block.type === "table") {
                                  return (
                                    <div
                                      key={`${section.title}-t-${blockIndex}`}
                                      style={{
                                        overflowX: "auto",
                                        borderRadius: BRAND_RADIUS_CARD,
                                        border: "1px solid rgba(221,228,239,0.34)",
                                        background: "rgba(249,251,255,0.76)",
                                        padding: "10px",
                                        maxWidth: "100%",
                                      }}
                                    >
                                      <table
                                        style={{
                                          width: "100%",
                                          minWidth: "560px",
                                          borderCollapse: "collapse",
                                        }}
                                      >
                                        <thead>
                                          <tr>
                                            {block.table.headers.map((header, headerIndex) => (
                                              <th
                                                key={`${section.title}-th-${blockIndex}-${headerIndex}`}
                                                style={{
                                                  textAlign: "left",
                                                  fontSize: "12px",
                                                  fontWeight: 800,
                                                  letterSpacing: "0.04em",
                                                  color: "#31445d",
                                                  background: headerIndex === 0 ? "rgba(233,239,248,0.96)" : "rgba(241,245,250,0.92)",
                                                  padding: "15px 18px",
                                                  borderBottom: `1px solid ${BRAND_TABLE_LINE}`,
                                                  whiteSpace: "nowrap",
                                                }}
                                              >
                                                {header}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {block.table.rows.map((row, rowIndex) => (
                                            <tr key={`${section.title}-tr-${blockIndex}-${rowIndex}`}>
                                              {row.map((cell, cellIndex) => {
                                                const looksNumeric = /[%円m度]|\d/.test(cell);
                                                return (
                                                  <td
                                                    key={`${section.title}-td-${blockIndex}-${rowIndex}-${cellIndex}`}
                                                    style={{
                                                      fontSize: "12.5px",
                                                      lineHeight: 1.86,
                                                      color: cellIndex === 0 ? "#31455f" : "#536273",
                                                      fontWeight: cellIndex === 0 ? 700 : looksNumeric ? 600 : 500,
                                                      padding: "15px 18px",
                                                      borderBottom: rowIndex === block.table.rows.length - 1
                                                        ? "none"
                                                        : `1px solid ${BRAND_TABLE_LINE}`,
                                                      whiteSpace: "pre-wrap",
                                                      verticalAlign: "top",
                                                      background: cellIndex === 0 ? "rgba(250,252,255,0.72)" : undefined,
                                                    }}
                                                  >
                                                    {cell}
                                                  </td>
                                                );
                                              })}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  );
                                }

                                const items = isSpecSection
                                  ? block.items.filter((item) => !detailSpecPattern.test(normalizeVenueMarkdownText(item)))
                                  : block.items;
                                if (items.length === 0) return null;
                                return (
                                  <ul
                                    key={`${section.title}-l-${blockIndex}`}
                                    style={{
                                      margin: 0,
                                      paddingLeft: "22px",
                                      display: "grid",
                                      gap: "16px",
                                      color: "#445367",
                                      width: "100%",
                                      maxWidth: detailBodyTextMaxWidth,
                                    }}
                                  >
                                    {items.map((item, itemIndex) => (
                                      <li
                                        key={`${section.title}-i-${blockIndex}-${itemIndex}`}
                                        style={{
                                          fontSize: "13.5px",
                                          lineHeight: 1.96,
                                          whiteSpace: "normal",
                                          wordBreak: "normal",
                                          overflowWrap: "break-word",
                                        }}
                                      >
                                        {normalizeVenueBodyText(item)}
                                      </li>
                                    ))}
                                  </ul>
                                );
                              })}
                            </>
                          )}
                        </div>
                      );

                      return (
                    <article
                      key={`${section.title}-${sectionIndex}`}
                      id={getDetailSectionAnchorInfo(section.title).domId}
                      style={{
                        position: "relative",
                        borderRadius: BRAND_RADIUS_SECTION,
                            border: BRAND_BORDER_SOFT,
                            background: "rgba(255,255,255,0.68)",
                            padding: isMobile ? "22px 16px" : "28px 24px 26px",
                            boxShadow: "0 1px 3px rgba(15,23,42,0.008)",
                        scrollMarginTop: "24px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          inset: "0 auto auto 0",
                          width: "132px",
                          height: "132px",
                          background: "radial-gradient(circle at top left, rgba(140,99,199,0.05), transparent 72%)",
                          pointerEvents: "none",
                        }}
                      />
                      <header style={{ marginBottom: "18px", position: "relative" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: "10px",
                            marginBottom: "6px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "22px",
                              lineHeight: 1,
                              fontWeight: 800,
                              letterSpacing: "-0.05em",
                              color: "rgba(140,99,199,0.2)",
                            }}
                          >
                            {heading.indexLabel}
                          </span>
                        </div>
                        <div
                          style={{
                            width: "48px",
                            height: "1px",
                            background: "linear-gradient(90deg, rgba(140,99,199,0.22), rgba(160,185,226,0.1))",
                            marginBottom: "10px",
                          }}
                        />
                        <h3
                          style={{
                            fontSize: isMobile ? "24px" : "29px",
                            fontWeight: 800,
                            letterSpacing: "-0.02em",
                            color: "#192436",
                            lineHeight: 1.22,
                            margin: 0,
                          }}
                        >
                          {heading.title}
                        </h3>
                        {!isMetaSection && !isSpecSection && introText && (
                          <p
                            style={{
                              margin: "10px 0 0",
                              width: "100%",
                              maxWidth: detailBodyTextMaxWidth,
                              fontSize: "13px",
                              lineHeight: 1.84,
                              color: "#67778b",
                              whiteSpace: "normal",
                              wordBreak: "normal",
                              overflowWrap: "break-word",
                            }}
                          >
                            {normalizeVenueBodyText(introText)}
                          </p>
                        )}
                      </header>

                      {isCompactSection ? (
                        <details>
                          <summary
                            style={{
                              cursor: "pointer",
                              listStyle: "none",
                              borderRadius: BRAND_RADIUS_CARD,
                              border: "1px solid rgba(220,226,238,0.74)",
                              background: "rgba(249,251,255,0.78)",
                              padding: "12px 14px",
                              color: "#5a6880",
                              fontSize: "12.5px",
                              lineHeight: 1.7,
                            }}
                          >
                            {introText || "表と本文の詳細を開く"}
                          </summary>
                          <div style={{ marginTop: "16px" }}>{articleBody}</div>
                        </details>
                      ) : (
                        articleBody
                      )}
                    </article>
                      );
                    })()
                  ))}
                      <div style={{ display: "flex", justifyContent: isMobile ? "center" : "flex-start" }}>
                        <button
                          type="button"
                          onClick={handleBackToTopClick}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            borderRadius: "9999px",
                            border: "1px solid rgba(205,198,228,0.72)",
                            background: "linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(247,244,255,0.92) 100%)",
                            color: "#58667a",
                            padding: isMobile ? "10px 14px" : "10px 16px",
                            fontSize: "12.5px",
                            lineHeight: 1.2,
                            fontWeight: 700,
                            letterSpacing: "0.01em",
                            boxShadow: "0 3px 10px rgba(140,99,199,0.06)",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            appearance: "none",
                          }}
                        >
                          <span style={{ fontSize: "13px", color: "#7a66ab", lineHeight: 1 }}>↑</span>
                          <span>上へ戻る</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 6. Venue card grid ─────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "0 16px 60px" : "0 40px 60px", background: "#ffffff" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
            marginBottom: "20px",
          }}
        >
          <span
            style={{
              fontSize: "11px",
              fontWeight: 900,
              letterSpacing: "0.22em",
              color: "rgba(140,99,199,0.7)",
            }}
          >
            {activeRegion === "すべて" ? "ALL VENUES" : activeRegion}
          </span>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 500,
              color: "#8a98a8",
              letterSpacing: "0.04em",
            }}
          >
            {filteredVenues.length} 会場
          </span>
        </div>

        {loadingIndex ? (
          <div
            style={{
              textAlign: "center",
              padding: "56px 0",
              color: "#9aaabb",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            読込中…
          </div>
        ) : filteredVenues.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "56px 0",
              color: "#9aaabb",
              fontSize: "14px",
            }}
          >
            この地域の会場データは準備中です。
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "22px",
            }}
          >
            {filteredVenues.map((venue) => {
              const summary = summaryMap[venue.venueName] ?? DEFAULT_VENUE_BANK_SUMMARY;
              const isActive = venue.venueName === selectedVenueName;
              const region = VENUE_REGION_MAP[venue.venueName] ?? "—";
              const heroImage = VENUE_HERO_IMAGE_MAP[venue.venueName]
              ? toPublicPath(VENUE_HERO_IMAGE_MAP[venue.venueName])
              : "";
              const hasImage = !!heroImage && !imageErrorSet.has(venue.venueName);
              const tags = deriveVenueTags(summary);
              return (
                <div
                  key={venue.venueKey}
                  onClick={() => setSelectedVenueName(venue.venueName)}
                  style={{
                    cursor: "pointer",
                    borderRadius: BRAND_RADIUS_SECTION,
                    border: isActive ? "1.5px solid rgba(176,137,228,0.44)" : BRAND_BORDER_SOFT,
                    background: isActive
                      ? "linear-gradient(160deg, rgba(244,234,252,0.86) 0%, rgba(234,242,252,0.84) 100%)"
                      : "rgba(255,255,255,0.96)",
                    boxShadow: isActive
                      ? "0 4px 14px rgba(140,99,199,0.06)"
                      : "none",
                    overflow: "hidden",
                    transition: "box-shadow 0.2s, transform 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    const card = e.currentTarget as HTMLDivElement;
                    card.style.transform = "translateY(-1px)";
                    card.style.boxShadow = "0 4px 12px rgba(15,23,42,0.04), 0 0 0 1px rgba(140,99,199,0.08)";
                    const img = card.querySelector("img");
                    if (img) img.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    const card = e.currentTarget as HTMLDivElement;
                    card.style.transform = "translateY(0)";
                    card.style.boxShadow = isActive
                      ? "0 4px 14px rgba(140,99,199,0.06)"
                      : "none";
                    const img = card.querySelector("img");
                    if (img) img.style.transform = "scale(1)";
                  }}
                >
                  {/* Image area */}
                  <div style={{ position: "relative", overflow: "hidden", height: hasImage ? "140px" : "100px" }}>
                    {hasImage ? (
                      <img
                        src={heroImage}
                        alt={venue.venueName}
                        onError={() =>
                          setImageErrorSet((prev) => new Set([...prev, venue.venueName]))
                        }
                        style={{
                          width: "100%",
                          height: "140px",
                          objectFit: "cover",
                          display: "block",
                          transition: "transform 0.5s ease",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          height: "100px",
                          background: isActive
                            ? "linear-gradient(145deg, #ede0fa 0%, #d8eafc 100%)"
                            : "linear-gradient(145deg, #f2edf8 0%, #eaf1fb 100%)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                        }}
                      >
                        <div
                          style={{
                            width: "1px",
                            height: "20px",
                            background: "rgba(140,99,199,0.18)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            letterSpacing: "0.24em",
                            color: "rgba(120,90,180,0.28)",
                          }}
                        >
                          {region.toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Soft bottom fade to blend with card body */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: "28px",
                        background: isActive
                          ? "linear-gradient(to bottom, transparent, rgba(244,234,252,0.55))"
                          : "linear-gradient(to bottom, transparent, rgba(255,255,255,0.55))",
                        pointerEvents: "none",
                      }}
                    />
                  </div>

                  {/* Text area */}
                  <div style={{ padding: "18px 20px 16px" }}>
                    <div
                      style={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                          color: isActive ? "rgba(140,99,199,0.6)" : "rgba(150,168,184,0.82)",
                        marginBottom: "6px",
                      }}
                    >
                      {region}
                    </div>
                    <div
                      style={{
                        fontSize: "21px",
                        fontWeight: 900,
                        letterSpacing: "-0.02em",
                        color: "#0c1426",
                        lineHeight: 1.2,
                        marginBottom: "10px",
                      }}
                    >
                      {venue.venueName}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "5px",
                        flexWrap: "wrap",
                        marginBottom: "10px",
                      }}
                    >
                      {summary.bankLength !== "確認中" && (
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 600,
                            color: "#708094",
                            background: "rgba(82,96,114,0.05)",
                            padding: "2px 9px",
                            borderRadius: "9999px",
                          }}
                        >
                          {summary.bankLength}
                        </span>
                      )}
                      {tags.map((tag) => {
                        const ts = TAG_STYLE_MAP[tag] ?? { color: "#526072", bg: "rgba(82,96,114,0.07)" };
                        return (
                          <span
                            key={tag}
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: ts.color,
                              background: ts.bg,
                              padding: "2px 9px",
                              borderRadius: "9999px",
                            }}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                    <p
                      style={{
                        fontSize: "11.5px",
                        lineHeight: 1.76,
                        color: "#667789",
                        margin: "0 0 12px",
                        overflow: "hidden",
                        maxHeight: "3.6em",
                      }}
                    >
                      {summary.feature}
                    </p>
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: isActive ? "#8c63c7" : "rgba(176,188,200,0.82)",
                        letterSpacing: "0.04em",
                      }}
                    >
                      詳しく見る →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 6. Footer note ─────────────────────────────────────────── */}
      <section style={{ padding: isMobile ? "0 16px 64px" : "0 40px 64px", background: "#f7f8fb" }}>
        <p
          style={{
            fontSize: "12px",
            color: "#aab8c4",
            lineHeight: 1.9,
            textAlign: "center",
            borderTop: "1px solid rgba(200,190,220,0.1)",
            paddingTop: "28px",
            margin: 0,
          }}
        >
          会場特徴は当日の並びや風向きによって見え方が変わるため、直前気配とあわせて確認したいです。
          <br />
          バンク特性はあくまで目安として、当日の流れとセットで見たいです。
        </p>
      </section>
    </div>
  );
}