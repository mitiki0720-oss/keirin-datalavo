import fs from "node:fs/promises";
import path from "node:path";

const PLAYER_CARD_DIR = path.resolve("public/data/player-cards");
const INDEX_PATH = path.join(PLAYER_CARD_DIR, "index.json");

function normalizeRegistrationNo(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return digits.padStart(6, "0").slice(-6);
}

function parseMarkdownTable(markdown, headingPattern) {
  const match = markdown.match(new RegExp(`${headingPattern}[\\s\\S]*?(?=\\n## |$)`));
  const block = match?.[0] ?? "";
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (lines.length < 3) return {};

  const rows = lines
    .slice(2)
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter((row) => row.length >= 2);

  return Object.fromEntries(rows.map((row) => [row[0], row[1]]));
}

function getFirstValue(source, keys) {
  for (const key of keys) {
    const value = String(source[key] ?? "").trim();
    if (value && value !== "-") return value;
  }
  return "";
}

function buildSummary(summaryTable) {
  const parts = [
    getFirstValue(summaryTable, ["格・軸"]),
    getFirstValue(summaryTable, ["買いの芯"]),
    getFirstValue(summaryTable, ["消しの芯"]),
  ].filter(Boolean);
  return parts.join(" / ").slice(0, 220);
}

async function main() {
  const entries = await fs.readdir(PLAYER_CARD_DIR, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const registrationNo = normalizeRegistrationNo(path.basename(entry.name, ".md"));
    if (!registrationNo) continue;

    const fullPath = path.join(PLAYER_CARD_DIR, entry.name);
    const [markdown, stat] = await Promise.all([
      fs.readFile(fullPath, "utf-8").catch(() => ""),
      fs.stat(fullPath),
    ]);
    const inputTable = parseMarkdownTable(markdown, "##\\s*1）入力欄");
    const summaryTable = parseMarkdownTable(markdown, "##\\s*3）1ページ要約");
    const scheduleTable = parseMarkdownTable(markdown, "##\\s*2）更新スケジュール");
    const profileTable = parseMarkdownTable(markdown, "##\\s*5）基本プロフィール");
    const className = getFirstValue(inputTable, ["現級班", "級班"]) || getFirstValue(profileTable, ["級班", "現級班"]);
    const updatedAt =
      getFirstValue(inputTable, ["最終更新（参照日）", "最終更新"]) ||
      getFirstValue(scheduleTable, ["最終更新（参照日）", "最終更新"]) ||
      stat.mtime.toISOString().slice(0, 10);

    items.push({
      registrationNo,
      id: registrationNo,
      name: getFirstValue(inputTable, ["選手名", "氏名"]) || undefined,
      kana: getFirstValue(inputTable, ["カナ"]) || undefined,
      class: className || undefined,
      grade: className || undefined,
      prefecture: getFirstValue(inputTable, ["府県", "所属"]) || undefined,
      region: getFirstValue(inputTable, ["地域ブロック", "地区"]) || undefined,
      style: getFirstValue(inputTable, ["脚質（表記）", "脚質"]) || undefined,
      file: `/data/player-cards/${registrationNo}.md`,
      updatedAt,
      source: "player-card",
      status: "ready",
      summary: buildSummary(summaryTable) || undefined,
    });
  }

  items.sort((a, b) => a.registrationNo.localeCompare(b.registrationNo));
  await fs.writeFile(INDEX_PATH, `${JSON.stringify(items, null, 2)}\n`, "utf-8");
  console.log(`Generated ${items.length} player card index entries -> ${INDEX_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
