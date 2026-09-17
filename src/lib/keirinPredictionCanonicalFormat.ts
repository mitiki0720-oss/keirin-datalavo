export type KeirinPredictionGrade = "A" | "B" | "C";
export type KeirinPurchaseDecision = "BUY" | "VALUE_BUY" | "SKIP";
export type KeirinCanonicalTicketSection = "purchase" | "shadow";

export type KeirinCanonicalTicket = {
  displayIndex: string;
  structuredIndex: string;
  betType: "3連単" | "2車単";
  combination: string;
  role: string;
  section: KeirinCanonicalTicketSection;
};

export type KeirinCanonicalPredictionBlock = {
  isCanonical: boolean;
  isValid: boolean;
  date?: string;
  venue?: string;
  headerRaceNumber?: number;
  metadataRaceNumber?: number;
  raceSelectGrade?: KeirinPredictionGrade;
  purchaseDecision?: KeirinPurchaseDecision;
  purchasePoints?: number;
  investmentYen?: number;
  purchaseTickets: KeirinCanonicalTicket[];
  shadowTickets: KeirinCanonicalTicket[];
  errors: string[];
};

const REQUIRED_SECTION_HEADERS = ["出走表", "並び", "展開", "買い目", "影目", "設計メモ"] as const;

const normalizeText = (value: unknown) => String(value ?? "")
  .replace(/\r\n/g, "\n")
  .normalize("NFKC");

const parseIntegerField = (text: string, field: string) => {
  const match = text.match(new RegExp(`^${field}\\s*:\\s*([\\d,]+)\\s*$`, "imu"));
  if (!match) return undefined;
  const value = Number(match[1].replaceAll(",", ""));
  return Number.isInteger(value) && value >= 0 ? value : undefined;
};

const getSectionBounds = (lines: string[], header: string) => {
  const start = lines.findIndex((line) => line === `【${header}】`);
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^【[^】]+】$/u.test(line));
  return { start, end: end < 0 ? lines.length : end };
};

const parseTicketSection = (
  lines: string[],
  section: KeirinCanonicalTicketSection,
  errors: string[],
) => {
  const header = section === "purchase" ? "買い目" : "影目";
  const bounds = getSectionBounds(lines, header);
  if (!bounds) return [];
  const rows = lines.slice(bounds.start + 1, bounds.end).filter(Boolean);
  const tickets: KeirinCanonicalTicket[] = [];
  const seen = new Set<string>();

  rows.forEach((line) => {
    if (line === "なし") return;
    const match = line.match(/^(\d{2})\s*\|\s*(3連単|2車単)\s*\|\s*([1-9](?:-[1-9]){1,2})\s*\|\s*(\S(?:.*\S)?)$/u);
    if (!match) {
      errors.push(`${section}-ticket-format:${line}`);
      return;
    }
    const [, displayIndex, rawBetType, combination, role] = match;
    const betType = rawBetType as "3連単" | "2車単";
    const parts = combination.split("-");
    const expectedParts = betType === "3連単" ? 3 : 2;
    if (parts.length !== expectedParts || new Set(parts).size !== expectedParts) {
      errors.push(`${section}-ticket-combination:${combination}`);
      return;
    }
    const expectedIndex = String(tickets.length + 1).padStart(2, "0");
    if (displayIndex !== expectedIndex) {
      errors.push(`${section}-ticket-index:expected=${expectedIndex},actual=${displayIndex}`);
    }
    const key = `${betType}:${combination}`;
    if (seen.has(key)) {
      errors.push(`${section}-ticket-duplicate:${key}`);
      return;
    }
    seen.add(key);
    tickets.push({
      displayIndex,
      structuredIndex: `${section === "purchase" ? "P" : "S"}${displayIndex}`,
      betType,
      combination,
      role,
      section,
    });
  });

  return tickets;
};

export function parseKeirinCanonicalPredictionBlock(value: unknown): KeirinCanonicalPredictionBlock {
  const text = normalizeText(value).trim();
  const lines = text.split("\n").map((line) => line.trim());
  const hasCanonicalHeader = lines.some((line) => /^【\d{4}-\d{2}-\d{2}\s+.+\s+\d{1,2}R】$/u.test(line));
  const isCanonical = hasCanonicalHeader || (
    lines.includes("【出走表】") &&
    lines.includes("【設計メモ】") &&
    /^raceSelectGrade\s*:/imu.test(text)
  );
  const errors: string[] = [];

  const headerMatch = lines.find((line) => /^【\d{4}-\d{2}-\d{2}\s+.+\s+\d{1,2}R】$/u.test(line))
    ?.match(/^【(\d{4}-\d{2}-\d{2})\s+(.+?)\s+(\d{1,2})R】$/u);
  const date = text.match(/^date\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/imu)?.[1];
  const venue = text.match(/^venue\s*:\s*(.+?)\s*$/imu)?.[1]?.trim();
  const metadataRaceNumber = Number(text.match(/^race\s*:\s*(\d{1,2})R\s*$/imu)?.[1]);
  const grade = text.match(/^raceSelectGrade\s*:\s*(A|B|C)\s*$/imu)?.[1]?.toUpperCase() as KeirinPredictionGrade | undefined;
  const decision = text.match(/^purchaseDecision\s*:\s*(BUY|VALUE_BUY|SKIP)\s*$/imu)?.[1]?.toUpperCase() as KeirinPurchaseDecision | undefined;
  const purchasePoints = parseIntegerField(text, "purchasePoints");
  const investmentYen = parseIntegerField(text, "investmentYen");
  const headerRaceNumber = Number(headerMatch?.[3]);

  if (isCanonical) {
    if (!headerMatch) errors.push("header-missing-or-invalid");
    if (!date) errors.push("date-missing-or-invalid");
    if (!venue) errors.push("venue-missing");
    if (!Number.isInteger(metadataRaceNumber) || metadataRaceNumber <= 0) errors.push("race-missing-or-invalid");
    if (!grade) errors.push("raceSelectGrade-missing-or-invalid");
    if (!decision) errors.push("purchaseDecision-missing-or-invalid");
    if (purchasePoints === undefined) errors.push("purchasePoints-missing-or-invalid");
    if (investmentYen === undefined) errors.push("investmentYen-missing-or-invalid");
    if (headerMatch && date && headerMatch[1] !== date) errors.push("header-date-mismatch");
    if (headerMatch && venue && headerMatch[2] !== venue) errors.push("header-venue-mismatch");
    if (headerMatch && Number.isInteger(metadataRaceNumber) && headerRaceNumber !== metadataRaceNumber) errors.push("header-race-mismatch");

    let previousIndex = -1;
    REQUIRED_SECTION_HEADERS.forEach((header) => {
      const index = lines.findIndex((line) => line === `【${header}】`);
      if (index < 0) errors.push(`section-missing:${header}`);
      if (index >= 0 && index <= previousIndex) errors.push(`section-order:${header}`);
      if (index >= 0) previousIndex = index;
    });
  }

  const purchaseTickets = parseTicketSection(lines, "purchase", errors);
  const shadowTickets = parseTicketSection(lines, "shadow", errors);
  const purchaseKeys = new Set(purchaseTickets.map((ticket) => `${ticket.betType}:${ticket.combination}`));
  shadowTickets.forEach((ticket) => {
    const key = `${ticket.betType}:${ticket.combination}`;
    if (purchaseKeys.has(key)) errors.push(`purchase-shadow-overlap:${key}`);
  });

  if (decision === "SKIP") {
    if (grade !== "C") errors.push("skip-grade-mismatch");
    if (purchasePoints !== 0) errors.push("skip-purchase-points");
    if (investmentYen !== 0) errors.push("skip-investment-yen");
    if (purchaseTickets.length > 0) errors.push("skip-has-purchase-tickets");
  } else if (decision === "BUY" || decision === "VALUE_BUY") {
    if (grade === "C") errors.push("buy-grade-mismatch");
    if (purchasePoints !== purchaseTickets.length) errors.push("purchase-ticket-count-mismatch");
    if (investmentYen !== purchaseTickets.length * 100) errors.push("investment-ticket-count-mismatch");
    if (decision === "BUY" && (purchaseTickets.length < 8 || purchaseTickets.length > 10)) errors.push("buy-points-out-of-range");
    if (decision === "VALUE_BUY" && (purchaseTickets.length < 10 || purchaseTickets.length > 14)) errors.push("value-buy-points-out-of-range");
  }

  return {
    isCanonical,
    isValid: isCanonical && errors.length === 0,
    date,
    venue,
    headerRaceNumber: Number.isInteger(headerRaceNumber) ? headerRaceNumber : undefined,
    metadataRaceNumber: Number.isInteger(metadataRaceNumber) ? metadataRaceNumber : undefined,
    raceSelectGrade: grade,
    purchaseDecision: decision,
    purchasePoints,
    investmentYen,
    purchaseTickets,
    shadowTickets,
    errors,
  };
}

export function buildKeirinPredictionOutputFormatContract(input: {
  date: string;
  venue: string;
  targetRaceNumbers: number[];
}) {
  const races = [...new Set(input.targetRaceNumbers.filter(Number.isFinite))].sort((a, b) => a - b);
  const raceList = races.map((raceNo) => `${raceNo}R`).join(", ");
  return [
    "====================",
    "【予想出力フォーマット契約 / COPY RANGE】",
    `対象日: ${input.date}`,
    `対象会場: ${input.venue}`,
    `必須対象R: ${raceList || "なし"}`,
    "",
    "- 対象Rを1Rずつ完全独立した ```text コードブロックで出力する。複数Rを同じコードブロックへまとめない。",
    "- 必須対象Rをすべて1回ずつ出力する。R抜け、R重複、指定外R、『以下同様』、省略は禁止。",
    "- 各ブロックの見出しと race は一致させ、日付・会場を全Rで保持する。",
    "- 各ブロックは次の順序・表記を厳守する。",
    "",
    "```text",
    `【${input.date} ${input.venue} nR】`,
    `date: ${input.date}`,
    `venue: ${input.venue}`,
    "race: nR",
    "raceSelectGrade: A | B | C",
    "purchaseDecision: BUY | VALUE_BUY | SKIP",
    "purchasePoints: 整数",
    "investmentYen: 整数",
    "",
    "【出走表】",
    "【並び】",
    "【展開】",
    "【買い目】",
    "01 | 3連単 | 1-2-3 | 厚め",
    "02 | 3連単 | 1-3-2 | 本線",
    "",
    "【影目】",
    "01 | 3連単 | 4-1-2 | 影",
    "",
    "【設計メモ】",
    "```",
    "",
    "- 実購入と影目はそれぞれ01から連番。betTypeは原則3連単、既存互換が必要な場合のみ2車単。",
    "- combinationは半角数字と半角ハイフンのみ。同一section内および実購入/影目間で同一組合せを重複させない。",
    "- A/HITはBUY・8〜10点、B/VALUEはVALUE_BUY・10〜14点、C/SKIPは0点。18点固定購入は禁止。",
    "- investmentYen=purchasePoints×100。purchasePointsは【買い目】の行数と一致させ、影目を含めない。",
    "- C/SKIPは次を厳守する。影候補のみ通常形式で出してよい。",
    "  purchaseDecision: SKIP",
    "  purchasePoints: 0",
    "  investmentYen: 0",
    "  【買い目】",
    "  なし",
    "- 見出しは【出走表】【並び】【展開】【買い目】【影目】【設計メモ】の順序・名称を変えない。",
    "====================",
  ].join("\n");
}
