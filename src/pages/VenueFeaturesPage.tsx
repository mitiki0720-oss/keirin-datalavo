import { useEffect, useMemo, useState } from "react";
import { SiteHeader } from "./PageImplementations";
import {
  DEFAULT_VENUE_BANK_SUMMARY,
  EMPTY_VENUE_INSIGHT_SUMMARY,
  findVenueInsightGroup,
  deriveVenueTags,
  formatVenueInsightMemo,
  groupVenueInsightEntries,
  isVenueInsightEntryReady,
  normalizeVenueMarkdownText,
  parseVenueBankSummary,
  parseVenueInsightMarkdown,
  parseVenueMasterSummary,
  parseVenueMarkdownDocument,
} from "./venueFeatures/venueFeatureParsers";
import {
  EMPTY_VENUE_MASTER_SUMMARY,
  REGIONS,
  VENUE_REGION_MAP,
  VENUE_TAG_OPTIONS,
  type RegionType,
  type VenueBankIndexItem,
  type VenueBankSummary,
  type VenueDetailBlock,
  type VenueDetailSection,
  type VenueInsightGroup,
  type VenueInsightIndexItem,
  type VenueInsightSummary,
  type VenueMasterSummary,
  type VenueMarkdownDocument,
  type VenueMetaEntry,
  type VenueTag,
} from "./venueFeatures/venueFeatureTypes";

const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizedBase}${normalizedPath}`;
};

const tabOptions = [
  { id: "overview", label: "Overview" },
  { id: "existing", label: "Existing Notes" },
  { id: "insights", label: "Summary Insights" },
  { id: "gpt", label: "GPT Material" },
  { id: "raw", label: "Raw Markdown" },
] as const;

type DetailTabId = (typeof tabOptions)[number]["id"];

const pageFont = "'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif";
const headingFont = "'Noto Serif JP', 'Hiragino Mincho ProN', serif";
const VENUE_FEATURES_BG_PATH = "/venue-features/venue-features-bg-bank-intelligence.png";
const brandRadiusPanel = "30px";
const brandRadiusCard = "20px";
const panelBorder = "1px solid rgba(160, 140, 220, 0.24)";
const panelBackground = "rgba(255,255,255,0.84)";
const panelShadow = "0 24px 70px rgba(80, 72, 140, 0.12)";

function normalizeVenueBodyText(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => normalizeVenueMarkdownText(line))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value: string, max = 120) {
  if (value.length <= max) return value;
  return `${value.slice(0, max).trim()}…`;
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

function getSectionSnippet(sections: VenueDetailSection[], keywords: string[], fallback: string) {
  const hit = sections.find((section) => keywords.some((keyword) => section.title.includes(keyword) || getSectionPlainText(section).includes(keyword)));
  if (!hit) return fallback;
  const text = getSectionPlainText(hit);
  return clipText(text || fallback, 120);
}

function renderDetailBlock(block: VenueDetailBlock, key: string) {
  if (block.type === "paragraph") {
    const text = normalizeVenueBodyText(block.text);
    if (!text) return null;
    return (
      <p
        key={key}
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: 2,
          color: "#46556a",
        }}
      >
        {text}
      </p>
    );
  }

  if (block.type === "subheading") {
    return (
      <h4
        key={key}
        style={{
          margin: 0,
          fontSize: "19px",
          lineHeight: 1.5,
          fontWeight: 800,
          color: "#18263b",
        }}
      >
        {block.text}
      </h4>
    );
  }

  if (block.type === "quote") {
    const text = normalizeVenueBodyText(block.text);
    if (!text) return null;
    return (
      <div
        key={key}
        style={{
          borderRadius: "18px",
          border: "1px solid rgba(209, 220, 236, 0.74)",
          background: "linear-gradient(180deg, rgba(244,248,255,0.94) 0%, rgba(239,245,255,0.88) 100%)",
          padding: "16px 18px",
          display: "grid",
          gap: "8px",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            fontWeight: 800,
            letterSpacing: "0.16em",
            color: "#6780a4",
          }}
        >
          INSIGHT
        </div>
        <div
          style={{
            fontSize: "13.5px",
            lineHeight: 1.9,
            color: "#4b5e78",
          }}
        >
          {text}
        </div>
      </div>
    );
  }

  if (block.type === "list") {
    return (
      <ul
        key={key}
        style={{
          margin: 0,
          paddingLeft: "22px",
          display: "grid",
          gap: "12px",
          color: "#46556a",
        }}
      >
        {block.items.map((item, index) => (
          <li
            key={`${key}-${index}`}
            style={{
              fontSize: "14px",
              lineHeight: 1.95,
            }}
          >
            {normalizeVenueBodyText(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (block.type === "checklist") {
    return (
      <div
        key={key}
        style={{
          display: "grid",
          gap: "12px",
          borderRadius: "18px",
          border: "1px solid rgba(221, 227, 239, 0.8)",
          background: "rgba(248,250,255,0.85)",
          padding: "14px 16px",
        }}
      >
        {block.items.map((item, index) => (
          <div
            key={`${key}-${index}`}
            style={{
              display: "grid",
              gridTemplateColumns: "18px 1fr",
              gap: "10px",
              alignItems: "start",
            }}
          >
            <span
              style={{
                width: "18px",
                height: "18px",
                borderRadius: "50%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 800,
                background: item.checked ? "#8d72cc" : "rgba(153,167,187,0.16)",
                color: item.checked ? "#fff" : "transparent",
              }}
            >
              ✓
            </span>
            <span
              style={{
                fontSize: "13.5px",
                lineHeight: 1.9,
                color: "#4b5a6d",
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
        key={key}
        style={{
          overflowX: "auto",
          borderRadius: "18px",
          border: "1px solid rgba(223,228,239,0.8)",
          background: "rgba(250,251,255,0.92)",
          padding: "10px",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: "560px",
            borderCollapse: "collapse",
            background: "rgba(255,255,255,0.95)",
          }}
        >
          <thead>
            <tr>
              {block.table.headers.map((header, index) => (
                <th
                  key={`${key}-th-${index}`}
                  style={{
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 800,
                    letterSpacing: "0.03em",
                    color: "#34485f",
                    background: "rgba(239,244,252,0.88)",
                    padding: "14px 16px",
                    borderBottom: "1px solid rgba(226,233,242,0.9)",
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
              <tr key={`${key}-tr-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${key}-td-${rowIndex}-${cellIndex}`}
                    style={{
                      fontSize: "12.5px",
                      lineHeight: 1.86,
                      color: cellIndex === 0 ? "#33485f" : "#526375",
                      fontWeight: cellIndex === 0 ? 700 : 500,
                      padding: "14px 16px",
                      borderBottom: rowIndex === block.table.rows.length - 1 ? "none" : "1px solid rgba(231,236,244,0.88)",
                      verticalAlign: "top",
                      whiteSpace: "pre-wrap",
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
    );
  }

  return (
    <div
      key={key}
      style={{
        height: "1px",
        background: "linear-gradient(90deg, rgba(140,99,199,0.18), rgba(160,185,226,0.18))",
      }}
    />
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div
      style={{
        borderRadius: brandRadiusCard,
        border: "1px solid rgba(214,220,235,0.72)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(246,249,255,0.88) 100%)",
        padding: "16px 18px",
        display: "grid",
        gap: "6px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 800,
          letterSpacing: "0.16em",
          color: "#7e8ca4",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "22px",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "#182338",
          lineHeight: 1.18,
        }}
      >
        {value}
      </div>
      {helper ? (
        <div
          style={{
            fontSize: "12px",
            lineHeight: 1.7,
            color: "#6a788c",
          }}
        >
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        cursor: "pointer",
        borderRadius: "9999px",
        border: active ? "1px solid rgba(151, 120, 214, 0.62)" : "1px solid rgba(214, 220, 235, 0.78)",
        background: active
          ? "linear-gradient(135deg, rgba(236,225,255,0.94) 0%, rgba(223,236,252,0.9) 100%)"
          : "linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(249,251,255,0.86) 100%)",
        color: active ? "#6b4ea6" : "#667489",
        padding: "10px 15px",
        fontSize: "12.5px",
        lineHeight: 1,
        fontWeight: active ? 700 : 600,
        boxShadow: active ? "0 6px 18px rgba(140,99,199,0.08)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}

export default function VenueFeaturesPage() {
  const [windowWidth, setWindowWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRegion, setActiveRegion] = useState<RegionType>("すべて");
  const [activeTag, setActiveTag] = useState<VenueTag | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTabId>("overview");
  const [venueIndex, setVenueIndex] = useState<VenueBankIndexItem[]>([]);
  const [insightGroups, setInsightGroups] = useState<VenueInsightGroup[]>([]);
  const [summaryMap, setSummaryMap] = useState<Record<string, VenueBankSummary>>({});
  const [selectedVenueName, setSelectedVenueName] = useState("");
  const [selectedVenueMarkdown, setSelectedVenueMarkdown] = useState("");
  const [selectedVenueDocument, setSelectedVenueDocument] = useState<VenueMarkdownDocument>({ title: "", meta: [], sections: [] });
  const [selectedVenueMasterMarkdown, setSelectedVenueMasterMarkdown] = useState("");
  const [selectedVenueMasterSummary, setSelectedVenueMasterSummary] = useState<VenueMasterSummary>(EMPTY_VENUE_MASTER_SUMMARY);
  const [selectedVenueInsightMarkdown, setSelectedVenueInsightMarkdown] = useState("");
  const [selectedVenueInsightSummary, setSelectedVenueInsightSummary] = useState<VenueInsightSummary>(EMPTY_VENUE_INSIGHT_SUMMARY);
  const [indexLoading, setIndexLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!copyStatus || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => setCopyStatus(""), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copyStatus]);

  useEffect(() => {
    let active = true;

    const loadIndexes = async () => {
      setIndexLoading(true);
      try {
        const bankIndexResponse = await fetch(toPublicPath("/data/venues/banks/index.json"), { cache: "force-cache" });
        const bankData = bankIndexResponse.ok ? ((await bankIndexResponse.json()) as VenueBankIndexItem[]) : [];

        const insightData = await fetch(toPublicPath("/data/venues/bank-insights/index.json"), { cache: "force-cache" })
          .then(async (response) => (response.ok ? ((await response.json()) as VenueInsightIndexItem[]) : []))
          .catch(() => []);

        if (!active) return;

        setVenueIndex(bankData);
        setInsightGroups(groupVenueInsightEntries(insightData));
        setSelectedVenueName((current) => current || bankData[0]?.venueName || "");

        const summaryEntries = await Promise.all(
          bankData.map(async (item) => {
            try {
              const response = await fetch(toPublicPath(item.file), { cache: "force-cache" });
              if (!response.ok) return [item.venueName, { ...DEFAULT_VENUE_BANK_SUMMARY }] as const;
              const markdown = await response.text();
              return [item.venueName, parseVenueBankSummary(markdown)] as const;
            } catch {
              return [item.venueName, { ...DEFAULT_VENUE_BANK_SUMMARY }] as const;
            }
          }),
        );

        if (!active) return;
        setSummaryMap(Object.fromEntries(summaryEntries));
      } finally {
        if (active) setIndexLoading(false);
      }
    };

    loadIndexes();

    return () => {
      active = false;
    };
  }, []);

  const filteredVenues = useMemo(() => {
    const query = searchQuery.trim();
    return venueIndex.filter((item) => {
      const matchesQuery = !query || item.venueName.includes(query) || item.venueKey.includes(query.toLowerCase());
      const matchesRegion = activeRegion === "すべて" || VENUE_REGION_MAP[item.venueName] === activeRegion;
      const summary = summaryMap[item.venueName] ?? DEFAULT_VENUE_BANK_SUMMARY;
      const tags = deriveVenueTags(summary);
      const matchesTag = !activeTag || tags.includes(activeTag);
      return matchesQuery && matchesRegion && matchesTag;
    });
  }, [activeRegion, activeTag, searchQuery, summaryMap, venueIndex]);

  useEffect(() => {
    if (filteredVenues.length === 0) return;
    if (filteredVenues.some((item) => item.venueName === selectedVenueName)) return;
    setSelectedVenueName(filteredVenues[0].venueName);
  }, [filteredVenues, selectedVenueName]);

  const selectedVenueItem = useMemo(
    () => venueIndex.find((item) => item.venueName === selectedVenueName) ?? null,
    [selectedVenueName, venueIndex],
  );
  const selectedInsightGroup = useMemo(
    () => findVenueInsightGroup(insightGroups, selectedVenueName, selectedVenueItem?.venueKey),
    [insightGroups, selectedVenueItem?.venueKey, selectedVenueName],
  );
  const selectedBankMasterEntry = selectedInsightGroup?.bankMasterEntry;
  const selectedReviewSummaryEntry = selectedInsightGroup?.reviewSummaryEntry;

  useEffect(() => {
    if (!selectedVenueItem) {
      setSelectedVenueMarkdown("");
      setSelectedVenueDocument({ title: "", meta: [], sections: [] });
      setSelectedVenueMasterMarkdown("");
      setSelectedVenueMasterSummary(EMPTY_VENUE_MASTER_SUMMARY);
      setSelectedVenueInsightMarkdown("");
      setSelectedVenueInsightSummary(EMPTY_VENUE_INSIGHT_SUMMARY);
      setDetailLoading(false);
      setDetailError("");
      return;
    }

    let active = true;

    const loadDetails = async () => {
      setDetailLoading(true);
      setDetailError("");
      setActiveTab("overview");

      const bankPromise = fetch(toPublicPath(selectedVenueItem.file), { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) throw new Error("bank-detail-missing");
        return response.text();
      });

      const masterPromise = selectedBankMasterEntry && isVenueInsightEntryReady(selectedBankMasterEntry)
        ? fetch(toPublicPath(selectedBankMasterEntry.file), { cache: "force-cache" })
            .then(async (response) => (response.ok ? response.text() : ""))
            .catch(() => "")
        : Promise.resolve("");

      const insightPromise = selectedReviewSummaryEntry && isVenueInsightEntryReady(selectedReviewSummaryEntry)
        ? fetch(toPublicPath(selectedReviewSummaryEntry.file), { cache: "force-cache" })
            .then(async (response) => (response.ok ? response.text() : ""))
            .catch(() => "")
        : Promise.resolve("");

      try {
        const [bankMarkdown, masterMarkdown, insightMarkdown] = await Promise.all([bankPromise, masterPromise, insightPromise]);
        if (!active) return;

        setSelectedVenueMarkdown(bankMarkdown);
        setSelectedVenueDocument(parseVenueMarkdownDocument(bankMarkdown));
        setSelectedVenueMasterMarkdown(masterMarkdown);
        setSelectedVenueMasterSummary(
          masterMarkdown
            ? parseVenueMasterSummary(masterMarkdown, { updatedAt: selectedBankMasterEntry?.updatedAt })
            : EMPTY_VENUE_MASTER_SUMMARY,
        );
        setSelectedVenueInsightMarkdown(insightMarkdown);
        setSelectedVenueInsightSummary(
          insightMarkdown
            ? parseVenueInsightMarkdown(insightMarkdown, {
                updatedAt: selectedReviewSummaryEntry?.updatedAt,
                source: selectedReviewSummaryEntry?.source,
              })
            : EMPTY_VENUE_INSIGHT_SUMMARY,
        );
      } catch {
        if (!active) return;
        setSelectedVenueMarkdown("");
        setSelectedVenueDocument({ title: selectedVenueName, meta: [], sections: [] });
        setSelectedVenueMasterMarkdown("");
        setSelectedVenueMasterSummary(EMPTY_VENUE_MASTER_SUMMARY);
        setSelectedVenueInsightMarkdown("");
        setSelectedVenueInsightSummary(EMPTY_VENUE_INSIGHT_SUMMARY);
        setDetailError("既存バンク特徴を読み込めませんでした。会場カードから別の会場を選んで再確認してください。");
      } finally {
        if (active) setDetailLoading(false);
      }
    };

    loadDetails();

    return () => {
      active = false;
    };
  }, [selectedBankMasterEntry, selectedReviewSummaryEntry, selectedVenueItem, selectedVenueName]);

  const isMobile = windowWidth < 960;
  const selectedSummary = summaryMap[selectedVenueName] ?? DEFAULT_VENUE_BANK_SUMMARY;
  const selectedTags = deriveVenueTags(selectedSummary);
  const selectedRegion = selectedVenueName ? VENUE_REGION_MAP[selectedVenueName] ?? "すべて" : "すべて";
  const selectedMeta = selectedVenueDocument.meta;
  const selectedBankLength = selectedSummary.bankLength !== DEFAULT_VENUE_BANK_SUMMARY.bankLength
    ? selectedSummary.bankLength
    : getDocumentMetaValue(selectedMeta, ["周長", "バンク長"]) || "記載なし";
  const selectedCant = getDocumentMetaValue(selectedMeta, ["カント"]) || "記載なし";
  const selectedStraight = getDocumentMetaValue(selectedMeta, ["みなし直線"]) || "記載なし";
  const selectedUpdatedAt = useMemo(() => {
    const bankUpdated = getDocumentMetaValue(selectedMeta, ["最終更新日", "更新日"]);
    return [selectedVenueInsightSummary.updatedAt, selectedVenueMasterSummary.updatedAt, bankUpdated].filter(Boolean).sort().at(-1) ?? "未記載";
  }, [selectedMeta, selectedVenueInsightSummary.updatedAt, selectedVenueMasterSummary.updatedAt]);

  const windSnippet = getSectionSnippet(selectedVenueDocument.sections, ["風", "追い風", "向かい風"], "風向きの癖は本文内で整理中です。");
  const timeSnippet = getSectionSnippet(selectedVenueDocument.sections, ["時間帯", "ナイター", "ミッド", "カテゴリ"], "時間帯別の傾向は本文側のノートで確認できます。");
  const lineupSnippet = getSectionSnippet(selectedVenueDocument.sections, ["ライン", "分戦", "戦術"], "ライン傾向は既存ノートから読み取れるように整理しています。");

  const gptMaterialPreview = useMemo(() => {
    const lines = [
      "[C. 会場特徴 / バンク傾向]",
      `会場名: ${selectedVenueName || "未選択"}`,
      `既存バンク特徴: ${selectedSummary.feature || "未取得"}`,
      `既存狙いどころ: ${selectedSummary.target || "未取得"}`,
      `既存注意点: ${selectedSummary.caution || "未取得"}`,
      "",
    ];

    if (selectedVenueMasterSummary.hasContent) {
      lines.push(
        "[会場別マスター分析]",
        `要点: ${selectedVenueMasterSummary.gptMaterial || ""}`,
        "",
      );
    }

    if (selectedVenueInsightSummary.hasContent) {
      lines.push(
        "[Summary学習メモ]",
        `学習特徴: ${selectedVenueInsightSummary.learnedFeature || ""}`,
        `予想で使う狙い: ${selectedVenueInsightSummary.learnedTarget || ""}`,
        `警戒: ${selectedVenueInsightSummary.learnedCaution || ""}`,
        `反映期間: ${selectedVenueInsightSummary.learnedPeriod || ""}`,
        `GPT素材用まとめ: ${selectedVenueInsightSummary.gptMaterial || ""}`,
      );
    }

    return lines.join("\n");
  }, [selectedSummary.caution, selectedSummary.feature, selectedSummary.target, selectedVenueInsightSummary, selectedVenueMasterSummary, selectedVenueName]);

  const handleCopyMaterial = async () => {
    try {
      await navigator.clipboard.writeText(gptMaterialPreview);
      setCopyStatus("GPT素材をコピーしました");
    } catch {
      setCopyStatus("コピーに失敗しました");
    }
  };

  const handleOpenMarkdown = (path?: string) => {
    if (!path || typeof window === "undefined") return;
    window.open(toPublicPath(path), "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="venue-features-page-root"
      style={{
        position: "relative",
        isolation: "isolate",
        minHeight: "100vh",
        overflowX: "hidden",
        background: "#eef3ff",
        fontFamily: pageFont,
      }}
    >
      <div
        aria-hidden="true"
        data-venue-bg-layer="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          backgroundColor: "#eef3ff",
          backgroundImage: [
            "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 40%, rgba(255,255,255,0.14) 100%)",
            `url("${toPublicPath(VENUE_FEATURES_BG_PATH)}")`,
          ].join(", "),
          backgroundRepeat: "no-repeat, no-repeat",
          backgroundSize: "100% auto, 100% auto",
          backgroundPosition: "center top, center top",
          filter: "saturate(1.14) contrast(1.06)",
        }}
      />

      <div style={{ position: "relative", zIndex: 2 }}>
        <SiteHeader activeKey="venues" />
      </div>

      <main
        style={{
          position: "relative",
          zIndex: 1,
          width: isMobile ? "min(1760px, calc(100vw - 32px))" : "min(1760px, calc(100vw - 48px))",
          maxWidth: "1760px",
          margin: "0 auto",
          padding: isMobile ? "32px 0 54px" : "44px 0 88px",
          boxSizing: "border-box",
        }}
      >

      <section style={{ padding: isMobile ? "0 0 20px" : "0 0 24px" }}>
        <div
          style={{
            borderRadius: "32px",
            border: panelBorder,
            background: panelBackground,
            backdropFilter: "blur(18px)",
            boxShadow: panelShadow,
            padding: isMobile ? "24px 20px" : "34px 32px",
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.4fr) minmax(360px, 0.9fr)",
            gap: isMobile ? "18px" : "24px",
          }}
        >
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.28em", color: "rgba(120, 96, 180, 0.74)" }}>BANK KNOWLEDGE LIBRARY</div>
            <h1 style={{ margin: 0, fontFamily: headingFont, fontSize: isMobile ? "36px" : "58px", lineHeight: 1.04, letterSpacing: "-0.05em", color: "#121b2c" }}>
              Bank Intelligence
            </h1>
            <div style={{ fontSize: isMobile ? "16px" : "18px", lineHeight: 1.8, color: "#56657a", maxWidth: "44ch" }}>
              既存バンク特徴と予想レビューから得た学習メモを、GPT素材へつなぐ。
            </div>
            <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#718094", maxWidth: "56ch" }}>
              会場ごとの走路・風・決まり手・狙い筋を整理し、予想時の判断材料として使います。
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
            <StatCard label="登録会場数" value={`${venueIndex.length}`} helper="既存バンク特徴Markdown" />
            <StatCard label="学習メモあり会場数" value={`${insightGroups.filter((group) => group.reviewSummaryEntry && isVenueInsightEntryReady(group.reviewSummaryEntry)).length}`} helper="review summary ready 件数" />
            <StatCard label="選択中会場" value={selectedVenueName || "未選択"} helper={selectedRegion !== "すべて" ? selectedRegion : "会場を選択してください"} />
            <StatCard label="最終更新" value={selectedUpdatedAt} helper="既存ノートと学習メモの新しい方" />
          </div>
        </div>
      </section>

      <section style={{ padding: isMobile ? "0 0 18px" : "0 0 24px" }}>
        <div
          style={{
            borderRadius: brandRadiusPanel,
            border: panelBorder,
            background: panelBackground,
            backdropFilter: "blur(18px)",
            boxShadow: panelShadow,
            padding: isMobile ? "18px 16px" : "24px 24px 22px",
            display: "grid",
            gap: "18px",
          }}
        >
          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.22em", color: "rgba(120, 96, 180, 0.7)" }}>SEARCH / FILTER</div>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="会場名で絞り込み"
              style={{
                width: "100%",
                borderRadius: "16px",
                border: "1px solid rgba(214, 220, 235, 0.94)",
                background: "rgba(255,255,255,0.9)",
                padding: "14px 16px",
                fontSize: "14px",
                color: "#1f2d41",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "#8090a6" }}>地域</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {REGIONS.map((region) => (
                <FilterChip key={region} label={region} active={activeRegion === region} onClick={() => setActiveRegion(region)} />
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "#8090a6" }}>タグ</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              <FilterChip label="すべて" active={!activeTag} onClick={() => setActiveTag(null)} />
              {VENUE_TAG_OPTIONS.map((tag) => (
                <FilterChip key={tag} label={tag} active={activeTag === tag} onClick={() => setActiveTag(tag)} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ padding: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "380px minmax(0, 1fr)",
            gap: isMobile ? "18px" : "28px",
            alignItems: "start",
          }}
        >
          <aside
            style={{
              borderRadius: brandRadiusPanel,
              border: panelBorder,
              background: panelBackground,
              backdropFilter: "blur(18px)",
              boxShadow: panelShadow,
              padding: isMobile ? "18px 16px" : "20px 18px",
              display: "grid",
              gap: "14px",
              position: isMobile ? "static" : "sticky",
              top: "92px",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", color: "rgba(120, 96, 180, 0.68)" }}>VENUE LIST</div>
                <div style={{ fontSize: "23px", fontWeight: 800, letterSpacing: "-0.03em", color: "#182338" }}>会場カード</div>
              </div>
              <div style={{ fontSize: "12px", color: "#7d8da4", fontWeight: 700 }}>{filteredVenues.length} 件</div>
            </div>

            {indexLoading ? (
              <div style={{ fontSize: "13px", color: "#708095", padding: "8px 0" }}>会場一覧を読み込み中です。</div>
            ) : filteredVenues.length === 0 ? (
              <div style={{ fontSize: "13px", color: "#708095", lineHeight: 1.8 }}>条件に一致する会場がありません。検索語またはフィルタを調整してください。</div>
            ) : (
              <div style={{ display: "grid", gap: "12px", maxHeight: isMobile ? "none" : "calc(100vh - 170px)", overflowY: isMobile ? "visible" : "auto", paddingRight: isMobile ? 0 : "4px" }}>
                {filteredVenues.map((venue) => {
                  const summary = summaryMap[venue.venueName] ?? DEFAULT_VENUE_BANK_SUMMARY;
                  const tags = deriveVenueTags(summary);
                  const insightGroup = findVenueInsightGroup(insightGroups, venue.venueName, venue.venueKey);
                  const reviewSummaryReady = !!(insightGroup?.reviewSummaryEntry && isVenueInsightEntryReady(insightGroup.reviewSummaryEntry));
                  const isSelected = venue.venueName === selectedVenueName;
                  return (
                    <button
                      key={venue.venueKey}
                      type="button"
                      onClick={() => setSelectedVenueName(venue.venueName)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        cursor: "pointer",
                        borderRadius: "22px",
                        border: isSelected ? "1px solid rgba(151, 120, 214, 0.48)" : "1px solid rgba(219, 224, 236, 0.84)",
                        background: isSelected ? "linear-gradient(180deg, rgba(244,236,255,0.98) 0%, rgba(235,243,255,0.94) 100%)" : "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,255,0.92) 100%)",
                        padding: "16px 16px 15px",
                        boxShadow: isSelected ? "0 10px 26px rgba(140,99,199,0.1)" : "0 4px 12px rgba(31,41,55,0.03)",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                        <div>
                          <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.16em", color: "#8a99ad" }}>{VENUE_REGION_MAP[venue.venueName] ?? "未分類"}</div>
                          <div style={{ fontSize: "23px", fontWeight: 800, letterSpacing: "-0.03em", color: "#162236", lineHeight: 1.1 }}>{venue.venueName}</div>
                        </div>
                        <div style={{ fontSize: "11px", color: isSelected ? "#6e53a9" : "#8291a5", fontWeight: 700 }}>{summary.bankLength}</div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                        {tags.length > 0 ? tags.map((tag) => (
                          <span key={tag} style={{ fontSize: "10px", fontWeight: 700, color: "#6f5ba0", background: "rgba(140,99,199,0.08)", borderRadius: "9999px", padding: "4px 9px" }}>{tag}</span>
                        )) : (
                          <span style={{ fontSize: "10px", color: "#96a4b8" }}>タグ整理中</span>
                        )}
                      </div>

                      <div style={{ display: "grid", gap: "7px" }}>
                        <div style={{ fontSize: "12px", color: "#516175", lineHeight: 1.75 }}>{clipText(summary.feature, 72)}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: "#4f6278", background: "rgba(82,96,114,0.07)", borderRadius: "9999px", padding: "4px 9px" }}>既存データあり</span>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: reviewSummaryReady ? "#6f5ba0" : "#8a98aa", background: reviewSummaryReady ? "rgba(140,99,199,0.08)" : "rgba(148,160,178,0.12)", borderRadius: "9999px", padding: "4px 9px" }}>
                            {reviewSummaryReady ? "Summary学習メモあり" : "Summary学習メモ未作成"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div style={{ display: "grid", gap: "18px" }}>
            <section
              style={{
                borderRadius: brandRadiusPanel,
                border: panelBorder,
                background: panelBackground,
                backdropFilter: "blur(18px)",
                boxShadow: panelShadow,
                padding: isMobile ? "20px 16px" : "24px 24px 26px",
                display: "grid",
                gap: "18px",
              }}
            >
              <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.22em", color: "rgba(120, 96, 180, 0.68)" }}>SELECTED VENUE INTELLIGENCE</div>
                  <div style={{ fontSize: isMobile ? "30px" : "40px", fontWeight: 800, letterSpacing: "-0.04em", color: "#152136", lineHeight: 1.08 }}>{selectedVenueDocument.title || selectedVenueName || "会場を選択してください"}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: "#6e53a9", background: "rgba(140,99,199,0.08)", borderRadius: "9999px", padding: "5px 10px" }}>{selectedRegion}</span>
                    {selectedTags.map((tag) => (
                      <span key={tag} style={{ fontSize: "11px", fontWeight: 700, color: "#56708f", background: "rgba(86,112,143,0.08)", borderRadius: "9999px", padding: "5px 10px" }}>{tag}</span>
                    ))}
                    <span style={{ fontSize: "11px", fontWeight: 700, color: selectedVenueInsightSummary.hasContent ? "#6f5ba0" : "#8a98aa", background: selectedVenueInsightSummary.hasContent ? "rgba(140,99,199,0.08)" : "rgba(148,160,178,0.12)", borderRadius: "9999px", padding: "5px 10px" }}>
                      {selectedVenueInsightSummary.hasContent ? "Summary学習メモあり" : "Summary学習メモ未作成"}
                    </span>
                    <span style={{ fontSize: "11px", fontWeight: 700, color: selectedVenueMasterSummary.hasContent ? "#4b677f" : "#8a98aa", background: selectedVenueMasterSummary.hasContent ? "rgba(86,112,143,0.08)" : "rgba(148,160,178,0.12)", borderRadius: "9999px", padding: "5px 10px" }}>
                      {selectedVenueMasterSummary.hasContent ? "会場別マスター分析あり" : "会場別マスター分析なし"}
                    </span>
                  </div>
                </div>

                <div style={{ display: "grid", gap: "8px", minWidth: isMobile ? "100%" : "260px" }}>
                  <div style={{ fontSize: "12px", color: "#708095", lineHeight: 1.8 }}>既存バンク特徴と review summary の両方を、予想前にそのまま読み返せる構成です。</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                    <StatCard label="周長" value={selectedBankLength} />
                    <StatCard label="カント" value={selectedCant} />
                    <StatCard label="みなし直線" value={selectedStraight} />
                  </div>
                </div>
              </div>

              {detailLoading ? (
                <div style={{ fontSize: "14px", color: "#6f7e92", borderRadius: brandRadiusCard, border: "1px solid rgba(223,228,239,0.72)", background: "rgba(255,255,255,0.78)", padding: "18px 20px" }}>会場データを読み込み中です。</div>
              ) : detailError ? (
                <div style={{ fontSize: "14px", color: "#875e64", borderRadius: brandRadiusCard, border: "1px solid rgba(229, 215, 219, 0.9)", background: "rgba(255,250,251,0.92)", padding: "18px 20px" }}>{detailError}</div>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(320px, 0.82fr)", gap: "18px" }}>
                    <div style={{ display: "grid", gap: "12px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                        {[
                          { label: "既存バンク特徴", value: selectedSummary.feature },
                          { label: "狙いどころ", value: selectedSummary.target },
                          { label: "注意点", value: selectedSummary.caution },
                        ].map((item) => (
                          <div key={item.label} style={{ borderRadius: brandRadiusCard, border: "1px solid rgba(220,225,238,0.8)", background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(247,250,255,0.9) 100%)", padding: "14px 15px", display: "grid", gap: "7px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: "#7a88a0" }}>{item.label}</div>
                            <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#334257" }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
                        {[
                          { label: "風", value: windSnippet },
                          { label: "時間帯", value: timeSnippet },
                          { label: "ライン傾向", value: lineupSnippet },
                        ].map((item) => (
                          <div key={item.label} style={{ borderRadius: brandRadiusCard, border: "1px solid rgba(218,224,236,0.78)", background: "rgba(248,251,255,0.84)", padding: "14px 15px", display: "grid", gap: "7px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: "#7a88a0" }}>{item.label}</div>
                            <div style={{ fontSize: "13px", lineHeight: 1.8, color: "#4a5b71" }}>{item.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "grid", gap: "12px" }}>
                      <div style={{ borderRadius: "24px", border: "1px solid rgba(212, 218, 235, 0.82)", background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(246,248,255,0.9) 100%)", padding: "18px 18px 20px", display: "grid", gap: "12px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(86,112,143,0.72)" }}>BANK MASTER</div>
                        {selectedVenueMasterSummary.hasContent ? (
                          <>
                            <div style={{ display: "grid", gap: "5px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 800, color: "#7e8ca4", letterSpacing: "0.08em" }}>会場別マスター分析</div>
                              <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#344358" }}>{selectedVenueMasterSummary.overview}</div>
                            </div>
                            <div style={{ display: "grid", gap: "5px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 800, color: "#7e8ca4", letterSpacing: "0.08em" }}>風と時間帯</div>
                              <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#344358" }}>{selectedVenueMasterSummary.wind}</div>
                            </div>
                            <div style={{ display: "grid", gap: "5px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 800, color: "#7e8ca4", letterSpacing: "0.08em" }}>戦術メモ</div>
                              <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#344358" }}>{selectedVenueMasterSummary.strategy}</div>
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#738297" }}>会場別マスター分析は未登録です。</div>
                        )}
                      </div>

                      <div style={{ borderRadius: "24px", border: "1px solid rgba(212, 218, 235, 0.82)", background: "linear-gradient(180deg, rgba(255,255,255,0.94) 0%, rgba(246,248,255,0.9) 100%)", padding: "18px 18px 20px", display: "grid", gap: "12px" }}>
                      <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>LEARNED SUMMARY INSIGHT</div>
                      {selectedVenueInsightSummary.hasContent ? (
                        <>
                          {[
                            { label: "学習特徴", value: selectedVenueInsightSummary.learnedFeature },
                            { label: "予想で使う狙い", value: selectedVenueInsightSummary.learnedTarget },
                            { label: "警戒", value: selectedVenueInsightSummary.learnedCaution },
                            { label: "反映期間", value: selectedVenueInsightSummary.learnedPeriod || selectedVenueInsightSummary.updatedAt || "未記載" },
                          ].map((item) => (
                            <div key={item.label} style={{ display: "grid", gap: "5px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 800, color: "#7e8ca4", letterSpacing: "0.08em" }}>{item.label}</div>
                              <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#344358" }}>{item.value || "未記載"}</div>
                            </div>
                          ))}
                          {selectedVenueInsightSummary.gptMaterial ? (
                            <div style={{ borderRadius: "18px", border: "1px solid rgba(216, 222, 237, 0.8)", background: "rgba(248,250,255,0.86)", padding: "14px 15px", display: "grid", gap: "6px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 800, color: "#7e8ca4", letterSpacing: "0.08em" }}>GPT素材用まとめ</div>
                              <div style={{ fontSize: "13.5px", lineHeight: 1.85, color: "#334257", whiteSpace: "pre-wrap" }}>{selectedVenueInsightSummary.gptMaterial}</div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#738297" }}>Summary学習メモは未作成です。bank-insights に追加すると、この欄と GPT 素材プレビューへ自動反映されます。</div>
                      )}
                    </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {tabOptions.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          cursor: "pointer",
                          borderRadius: "9999px",
                          border: activeTab === tab.id ? "1px solid rgba(151, 120, 214, 0.54)" : "1px solid rgba(214, 220, 235, 0.84)",
                          background: activeTab === tab.id ? "linear-gradient(180deg, rgba(245,238,255,0.96) 0%, rgba(233,243,255,0.9) 100%)" : "rgba(255,255,255,0.84)",
                          color: activeTab === tab.id ? "#6d52a7" : "#677589",
                          fontSize: "12.5px",
                          fontWeight: 700,
                          padding: "9px 14px",
                          boxShadow: activeTab === tab.id ? "0 6px 16px rgba(140,99,199,0.08)" : "none",
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {activeTab === "overview" ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ borderRadius: "22px", border: "1px solid rgba(220,225,238,0.78)", background: "rgba(255,255,255,0.9)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>AT A GLANCE</div>
                        <div style={{ fontSize: "14px", lineHeight: 1.95, color: "#425267" }}>{selectedSummary.feature}</div>
                        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                          <div style={{ borderRadius: "18px", background: "rgba(244,248,255,0.8)", padding: "13px 14px", display: "grid", gap: "6px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: "#7a88a0" }}>既存ノートの狙い</div>
                            <div style={{ fontSize: "13.5px", lineHeight: 1.8, color: "#344358" }}>{selectedSummary.target}</div>
                          </div>
                          <div style={{ borderRadius: "18px", background: "rgba(255,248,246,0.76)", padding: "13px 14px", display: "grid", gap: "6px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: "#8a7a73" }}>注意して見る点</div>
                            <div style={{ fontSize: "13.5px", lineHeight: 1.8, color: "#344358" }}>{selectedSummary.caution}</div>
                          </div>
                        </div>
                      </div>

                      <div style={{ borderRadius: "22px", border: "1px solid rgba(220,225,238,0.78)", background: "rgba(255,255,255,0.9)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(86,112,143,0.72)" }}>会場別マスター分析</div>
                        <div style={{ fontSize: "13.5px", lineHeight: 1.95, color: "#425267" }}>
                          {selectedVenueMasterSummary.hasContent ? selectedVenueMasterSummary.gptMaterial : "会場別マスター分析は未登録です。"}
                        </div>
                      </div>

                      <div style={{ borderRadius: "22px", border: "1px solid rgba(220,225,238,0.78)", background: "rgba(255,255,255,0.9)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>SUMMARY MEMO</div>
                        <div style={{ fontSize: "13.5px", lineHeight: 1.95, color: "#425267", whiteSpace: "pre-wrap" }}>
                          {selectedVenueInsightSummary.hasContent ? formatVenueInsightMemo(selectedVenueInsightSummary) : "Summary学習メモはまだありません。"}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "existing" ? (
                    <div style={{ display: "grid", gap: "16px" }}>
                      {selectedVenueDocument.sections.length > 0 ? selectedVenueDocument.sections.map((section, sectionIndex) => (
                        <article key={`${section.title}-${sectionIndex}`} style={{ borderRadius: "24px", border: "1px solid rgba(220,225,238,0.82)", background: "rgba(255,255,255,0.92)", padding: isMobile ? "18px 16px" : "22px 20px", display: "grid", gap: "14px" }}>
                          <div style={{ display: "grid", gap: "8px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>SECTION {sectionIndex + 1}</div>
                            <h3 style={{ margin: 0, fontSize: isMobile ? "22px" : "28px", lineHeight: 1.25, fontWeight: 800, letterSpacing: "-0.03em", color: "#172338" }}>{section.title}</h3>
                          </div>
                          <div style={{ display: "grid", gap: "14px" }}>
                            {section.blocks.map((block, blockIndex) => renderDetailBlock(block, `${section.title}-${blockIndex}`))}
                          </div>
                        </article>
                      )) : (
                        <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#738297" }}>本文は準備中です。</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "insights" ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      {selectedVenueInsightSummary.hasContent ? (
                        <>
                          <div style={{ borderRadius: "22px", border: "1px solid rgba(220,225,238,0.8)", background: "rgba(255,255,255,0.9)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                            {[
                              { label: "学習特徴", value: selectedVenueInsightSummary.learnedFeature },
                              { label: "予想で使う狙い", value: selectedVenueInsightSummary.learnedTarget },
                              { label: "警戒", value: selectedVenueInsightSummary.learnedCaution },
                              { label: "反映期間", value: selectedVenueInsightSummary.learnedPeriod || selectedVenueInsightSummary.updatedAt || "未記載" },
                              { label: "根拠", value: selectedVenueInsightSummary.root || "未記載" },
                            ].map((item) => (
                              <div key={item.label} style={{ display: "grid", gap: "4px" }}>
                                <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.12em", color: "#7a88a0" }}>{item.label}</div>
                                <div style={{ fontSize: "13.5px", lineHeight: 1.86, color: "#344358" }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderRadius: "22px", border: "1px solid rgba(220,225,238,0.8)", background: "rgba(248,250,255,0.9)", padding: "18px 18px", display: "grid", gap: "8px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>GPT MATERIAL</div>
                            <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#344358", whiteSpace: "pre-wrap" }}>{selectedVenueInsightSummary.gptMaterial || "GPT素材用まとめは未記載です。"}</div>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: "13.5px", lineHeight: 1.9, color: "#738297" }}>Summary学習メモは未作成です。public/data/venues/bank-insights/index.json に登録されるとここへ表示します。</div>
                      )}
                    </div>
                  ) : null}

                  {activeTab === "gpt" ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <button type="button" onClick={handleCopyMaterial} style={{ cursor: "pointer", borderRadius: "9999px", border: "1px solid rgba(151, 120, 214, 0.54)", background: "linear-gradient(180deg, rgba(245,238,255,0.96) 0%, rgba(233,243,255,0.9) 100%)", color: "#6d52a7", fontSize: "12.5px", fontWeight: 700, padding: "10px 16px" }}>GPT素材をコピー</button>
                        <button type="button" onClick={() => handleOpenMarkdown(selectedVenueItem?.file)} style={{ cursor: "pointer", borderRadius: "9999px", border: "1px solid rgba(214, 220, 235, 0.84)", background: "rgba(255,255,255,0.9)", color: "#58667a", fontSize: "12.5px", fontWeight: 700, padding: "10px 16px" }}>Markdownを開く</button>
                        <button type="button" disabled={!selectedBankMasterEntry || !isVenueInsightEntryReady(selectedBankMasterEntry)} onClick={() => handleOpenMarkdown(selectedBankMasterEntry?.file)} style={{ cursor: selectedBankMasterEntry && isVenueInsightEntryReady(selectedBankMasterEntry) ? "pointer" : "default", borderRadius: "9999px", border: "1px solid rgba(214, 220, 235, 0.84)", background: selectedBankMasterEntry && isVenueInsightEntryReady(selectedBankMasterEntry) ? "rgba(255,255,255,0.9)" : "rgba(244,246,250,0.9)", color: selectedBankMasterEntry && isVenueInsightEntryReady(selectedBankMasterEntry) ? "#58667a" : "#98a5b7", fontSize: "12.5px", fontWeight: 700, padding: "10px 16px" }}>会場別マスター分析を開く</button>
                        <button type="button" disabled={!selectedReviewSummaryEntry || !isVenueInsightEntryReady(selectedReviewSummaryEntry)} onClick={() => handleOpenMarkdown(selectedReviewSummaryEntry?.file)} style={{ cursor: selectedReviewSummaryEntry && isVenueInsightEntryReady(selectedReviewSummaryEntry) ? "pointer" : "default", borderRadius: "9999px", border: "1px solid rgba(214, 220, 235, 0.84)", background: selectedReviewSummaryEntry && isVenueInsightEntryReady(selectedReviewSummaryEntry) ? "rgba(255,255,255,0.9)" : "rgba(244,246,250,0.9)", color: selectedReviewSummaryEntry && isVenueInsightEntryReady(selectedReviewSummaryEntry) ? "#58667a" : "#98a5b7", fontSize: "12.5px", fontWeight: 700, padding: "10px 16px" }}>Summary学習メモを開く</button>
                        {copyStatus ? <span style={{ alignSelf: "center", fontSize: "12px", color: copyStatus.includes("失敗") ? "#875e64" : "#6d52a7" }}>{copyStatus}</span> : null}
                      </div>

                      <div style={{ borderRadius: "22px", border: "1px solid rgba(160, 140, 220, 0.2)", background: "rgba(255,255,255,0.84)", backdropFilter: "blur(18px)", padding: "18px 18px" }}>
                        <pre style={{ margin: 0, fontSize: "13px", lineHeight: 1.9, color: "#304055", fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{gptMaterialPreview}</pre>
                      </div>
                    </div>
                  ) : null}

                  {activeTab === "raw" ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      <div style={{ borderRadius: "22px", border: "1px solid rgba(160, 140, 220, 0.2)", background: "rgba(255,255,255,0.84)", backdropFilter: "blur(18px)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>EXISTING MARKDOWN</div>
                        <pre style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.85, color: "#3a4b5f", fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{selectedVenueMarkdown || "既存Markdownなし"}</pre>
                      </div>
                      <div style={{ borderRadius: "22px", border: "1px solid rgba(160, 140, 220, 0.2)", background: "rgba(255,255,255,0.84)", backdropFilter: "blur(18px)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(86,112,143,0.72)" }}>BANK MASTER MARKDOWN</div>
                        <pre style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.85, color: "#3a4b5f", fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{selectedVenueMasterMarkdown || "会場別マスター分析なし"}</pre>
                      </div>
                      <div style={{ borderRadius: "22px", border: "1px solid rgba(160, 140, 220, 0.2)", background: "rgba(255,255,255,0.84)", backdropFilter: "blur(18px)", padding: "18px 18px", display: "grid", gap: "10px" }}>
                        <div style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.18em", color: "rgba(120,96,180,0.68)" }}>SUMMARY INSIGHT MARKDOWN</div>
                        <pre style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.85, color: "#3a4b5f", fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{selectedVenueInsightMarkdown || "Summary学習メモは未作成"}</pre>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      </section>
      </main>
    </div>
  );
}
