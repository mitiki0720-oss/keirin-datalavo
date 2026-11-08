import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";

globalThis.__mobileTestGlob = () => ({});
const bundle = await build({
  stdin: { contents: 'export { parsePredictionTextToStructuredPrediction, buildPredictionSlotRaceKey } from "./src/pages/PageImplementations"; export { getMobilePredictionPresentation } from "./src/lib/mobilePredictionPresentation";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, platform: "node", format: "esm", write: false,
  define: { "import.meta.env.BASE_URL": '"/keirin-datalavo/"', "import.meta.env.DEV": "false", "import.meta.glob": "__mobileTestGlob" },
});
const { parsePredictionTextToStructuredPrediction: jsonize, getMobilePredictionPresentation: present, buildPredictionSlotRaceKey } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString("base64")}`);
const skipCombinations = ["1-2-4", "1-2-3", "1-2-6", "2-1-6", "2-1-3", "2-1-4", "1-4-2", "1-4-6", "1-6-2", "1-3-2", "2-4-1", "2-3-1", "1-4-3", "1-6-3", "2-6-1", "3-2-1", "4-1-2", "6-1-2"];
const buyCombinations = ["4-1-2", "4-1-7", "4-1-3", "4-2-1", "4-3-5", "2-7-4", "2-4-1", "2-4-7", "7-2-4", "3-5-4", "4-3-1", "1-4-2", "4-1-5", "4-1-6", "3-5-2", "5-3-4", "7-2-3", "1-4-7"];
const roles = ["厚め", "厚め", "本線", "番手混在", "九州残り", "関東差し", "別線逆転", "関東残り", "先行押切り", "九州連係", "自在浮上", "番手差し"];
function fixture(race, grade, decision, count, combinations) {
  const row = (combination, index, role) => `${String(index + 1).padStart(2, "0")} | 3連単 | ${combination} | ${role}`;
  const predictionText = [
    `【2026-11-09 青森 ${race}R】`, "date: 2026-11-09", "venue: 青森", `race: ${race}R`,
    `raceSelectGrade: ${grade}`, `purchaseDecision: ${decision}`, `purchasePoints: ${count}`, `investmentYen: ${count * 100}`,
    "【出走表】", "人工fixture・実予想ではない", "【並び】", "固定ラインなし", "【展開】", "表示試験",
    "【買い目】", ...(count ? combinations.slice(0, count).map((c, i) => row(c, i, roles[i])) : ["なし"]),
    "【影目】", ...combinations.slice(count).map((c, i) => row(c, i, "影")), "【設計メモ】", "ruleVersion: v2026-10",
  ].join("\n");
  return { predictionText, predictionJson: jsonize(predictionText) };
}
const skip = fixture(1, "C", "SKIP", 0, skipCombinations);
const value = fixture(2, "B", "VALUE_BUY", 12, buyCombinations);
const buy = fixture(3, "A", "BUY", 8, buyCombinations);
let assertions = 0;
const check = (condition, label) => { assert.ok(condition, label); assertions++; };
for (const [slot, grade, decision, purchases, shadows] of [[skip, "C", "SKIP", 0, 18], [value, "B", "VALUE_BUY", 12, 6], [buy, "A", "BUY", 8, 10]]) {
  const before = JSON.stringify(slot);
  const p = present(slot);
  check(p.gradeLabel === `評価 ${grade}`, "explicit race grade");
  check(p.decision === decision, "explicit decision");
  check(p.purchaseCount === purchases && p.shadowCount === shadows && p.unknownCount === 0, "purchase/shadow counts");
  check(p.groups.flatMap((g) => g.tickets).length === 18, "all 18 candidates retained");
  check(JSON.stringify(slot) === before, "saved data remains unchanged");
}
check(present(skip).summary === "買い目なし / 影目のみ 18点", "SKIP shadow-only summary");
check(present(skip).decisionLabel === "見送り", "SKIP wording");
check(present(buy).decisionLabel === "購入対象", "BUY wording");
check(present(value).decisionLabel === "条件付き購入", "VALUE_BUY wording");
check(present(value).groups[0].tickets.map((t) => t.role).join("|") === roles.join("|"), "every original role retained");
check(present(skip).groups[0].tickets.every((t) => t.role === "影"), "shadow labels retained");
const holeText = value.predictionText.replace("4-1-2 | 厚め", "4-1-2 | 穴");
check(present({ predictionText: holeText, predictionJson: jsonize(holeText) }).groups[0].tickets[0].role === "穴", "original hole label retained");
check(skip.predictionJson.tickets[0].index === "S01" && value.predictionJson.tickets[0].index === "P01", "purchase and shadow identifiers distinct");
const legacy = structuredClone(value);
delete legacy.predictionJson.betPlan; delete legacy.predictionJson.raceMetadata;
legacy.predictionJson.tickets.forEach((t) => { t.note = undefined; t.group = "その他"; });
check(present(legacy).purchaseCount === 12 && present(legacy).shadowCount === 6, "old JSON reads explicit original text without re-saving");
check(present(legacy).groups[0].tickets[3].role === "番手混在", "old JSON custom role recovery");
const unknown = structuredClone(legacy); unknown.predictionText = "";
check(present(unknown).unknownCount === 18 && present(unknown).purchaseCount === 0, "unknown classification never assumed purchased");
check(present(unknown).gradeLabel === "評価未記載", "missing grade not invented");
check(present(unknown).groups[0].tickets.every((t) => t.role === "ラベル未記載"), "missing role not invented");
const conflict = structuredClone(value); conflict.predictionJson.betPlan.shadowTicketIndices.push("P01");
check(present(conflict).unknownCount === 1, "overlapping purchase/shadow indices stay unknown");
const gradeConflict = structuredClone(value); gradeConflict.predictionJson.raceMetadata.raceSelectGrade = "A";
check(present(gradeConflict).gradeLabel === "評価未記載", "conflicting grades not selected arbitrarily");
check(present().groups.length === 0, "no saved prediction");
const source = readFileSync("src/pages/MobileDashboardPage.tsx", "utf8");
check(source.includes("group.label") && source.includes("{role}"), "UI renders group and original role");
check(source.includes("mobile-race-decision") && source.includes("mobile-prediction-summary"), "per-race decision and counts rendered");

if (process.env.MOBILE_FIXTURE_OUTPUT) {
  const input = JSON.parse(readFileSync("public/data/races/today.generated.json", "utf8"));
  const venue = input.venues.find((v) => v.venueCode === "12"); assert.ok(venue);
  const feed = { ...input, date: "2026-11-09", venues: [{ ...venue, races: venue.races.slice(0, 3).map((r) => ({ ...r, resultStatus: "pending", result: undefined, resultTop3: [], payouts: [] })) }] };
  const records = {};
  [skip, value, buy].forEach((slot, i) => {
    const race = feed.venues[0].races[i]; const raceKey = buildPredictionSlotRaceKey(feed.date, feed.venues[0], race);
    records[raceKey] = { raceKey, raceId: feed.venues[0].raceIds?.[i] ?? "", date: feed.date, venue: "青森", raceNumber: i + 1, ...slot, savedAt: "2026-11-09T01:00:00Z" };
  });
  writeFileSync(path.resolve(process.env.MOBILE_FIXTURE_OUTPUT), JSON.stringify({ artificial: true, feed, predictions: { records } }, null, 2));
}
console.log(`Mobile prediction presentation: ${assertions}/${assertions} assertions PASS`);
