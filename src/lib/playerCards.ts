export type PlayerCardIndexItem = {
  registrationNo: string;
  id?: string;
  name?: string;
  kana?: string;
  class?: string;
  grade?: string;
  prefecture?: string;
  region?: string;
  style?: string;
  file: string;
  updatedAt?: string;
  source?: "player-card" | string;
  status?: "ready" | string;
  summary?: string;
};

const toPublicPath = (path: string) => {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}${path.replace(/^\/+/, "")}`;
};

export function normalizeRegistrationNo(value: unknown) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.padStart(6, "0").slice(-6);
}

export async function loadPlayerCardIndex(): Promise<PlayerCardIndexItem[]> {
  const response = await fetch(toPublicPath("/data/player-cards/index.json"), { cache: "no-cache" });
  if (!response.ok) throw new Error(`player-card-index-${response.status}`);
  const payload: unknown = await response.json();
  const payloadRecord = payload && typeof payload === "object" ? payload as { items?: unknown } : null;
  const items: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(payloadRecord?.items)
      ? payloadRecord.items
      : [];

  return items
    .map((item): PlayerCardIndexItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const registrationNo = normalizeRegistrationNo(record.registrationNo ?? record.id);
      const file = String(record.file ?? "").trim() || (registrationNo ? `/data/player-cards/${registrationNo}.md` : "");
      if (!registrationNo || !file) return null;

      return {
        registrationNo,
        id: String(record.id ?? registrationNo),
        name: String(record.name ?? "").trim() || undefined,
        kana: String(record.kana ?? "").trim() || undefined,
        class: String(record.class ?? record.grade ?? "").trim() || undefined,
        grade: String(record.grade ?? record.class ?? "").trim() || undefined,
        prefecture: String(record.prefecture ?? "").trim() || undefined,
        region: String(record.region ?? "").trim() || undefined,
        style: String(record.style ?? "").trim() || undefined,
        file,
        updatedAt: String(record.updatedAt ?? "").trim() || undefined,
        source: String(record.source ?? "player-card"),
        status: String(record.status ?? "ready"),
        summary: String(record.summary ?? "").trim() || undefined,
      };
    })
    .filter((item): item is PlayerCardIndexItem => item !== null)
    .sort((a, b) => a.registrationNo.localeCompare(b.registrationNo));
}

export function findPlayerCardByRegistrationNo(
  index: PlayerCardIndexItem[],
  registrationNo: unknown,
): PlayerCardIndexItem | null {
  const normalized = normalizeRegistrationNo(registrationNo);
  if (!normalized) return null;
  return index.find((item) => item.registrationNo === normalized) ?? null;
}

export async function loadPlayerCardMarkdown(file: string): Promise<string> {
  const normalized = String(file ?? "").trim();
  if (!normalized) throw new Error("player-card-file-empty");
  const response = await fetch(toPublicPath(normalized), { cache: "no-cache" });
  if (!response.ok) throw new Error(`player-card-markdown-${response.status}`);
  return response.text();
}
