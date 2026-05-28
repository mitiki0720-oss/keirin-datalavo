export type VenueBankIndexItem = {
  venueKey: string;
  venueName: string;
  file: string;
  aliases?: string[];
};

export type VenueBankSummary = {
  bankLength: string;
  feature: string;
  target: string;
  caution: string;
  source: string;
};

export type VenueDetailTable = {
  headers: string[];
  rows: string[][];
};

export type VenueChecklistItem = {
  text: string;
  checked: boolean;
};

export type VenueDetailBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "checklist"; items: VenueChecklistItem[] }
  | { type: "quote"; text: string }
  | { type: "table"; table: VenueDetailTable }
  | { type: "subheading"; text: string }
  | { type: "rule" };

export type VenueDetailSection = {
  title: string;
  blocks: VenueDetailBlock[];
};

export type VenueMetaEntry = {
  label: string;
  value: string;
};

export type VenueMarkdownDocument = {
  title: string;
  meta: VenueMetaEntry[];
  sections: VenueDetailSection[];
};

export type VenueInsightSource = "bank-master" | "review-summary";
export type VenueInsightStatus = "ready" | "planned";

export type VenueInsightIndexItem = {
  venueKey: string;
  venueName: string;
  file: string;
  updatedAt?: string;
  source?: VenueInsightSource | string;
  status?: VenueInsightStatus;
  aliases?: string[];
};

export type VenueInsightGroup = {
  venueKey: string;
  venueName: string;
  aliases?: string[];
  bankMasterEntry?: VenueInsightIndexItem;
  reviewSummaryEntry?: VenueInsightIndexItem;
};

export type VenueInsightSummary = {
  learnedFeature: string;
  learnedTarget: string;
  learnedCaution: string;
  learnedPeriod: string;
  root: string;
  gptMaterial: string;
  updatedAt: string;
  source: string;
  hasContent: boolean;
};

export type VenueMasterSummary = {
  title: string;
  updatedAt: string;
  bankLength: string;
  cant: string;
  straight: string;
  overview: string;
  wind: string;
  strategy: string;
  gptMaterial: string;
  hasContent: boolean;
};

export const REGIONS = [
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

export type RegionType = (typeof REGIONS)[number];

export const VENUE_TAG_OPTIONS = [
  "先行注目",
  "差し注目",
  "捲り注意",
  "波乱含み",
  "風向き注意",
  "ナイター変化",
] as const;

export type VenueTag = (typeof VENUE_TAG_OPTIONS)[number];

export const VENUE_REGION_MAP: Record<string, RegionType> = {
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

export const DEFAULT_VENUE_BANK_SUMMARY: VenueBankSummary = {
  bankLength: "確認中",
  feature: "会場特徴を整理中です。",
  target: "主導権と番手差しのバランスを見ながら組み立てたい。",
  caution: "当日の並びと気配を優先して確認したい。",
  source: "fallback",
};

export const EMPTY_VENUE_INSIGHT_SUMMARY: VenueInsightSummary = {
  learnedFeature: "",
  learnedTarget: "",
  learnedCaution: "",
  learnedPeriod: "",
  root: "",
  gptMaterial: "",
  updatedAt: "",
  source: "missing",
  hasContent: false,
};

export const EMPTY_VENUE_MASTER_SUMMARY: VenueMasterSummary = {
  title: "",
  updatedAt: "",
  bankLength: "",
  cant: "",
  straight: "",
  overview: "",
  wind: "",
  strategy: "",
  gptMaterial: "",
  hasContent: false,
};