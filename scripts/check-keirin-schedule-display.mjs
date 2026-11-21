import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sha256 } from "./update-keirin-upcoming-schedule.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const pageText = await fs.readFile(new URL("../src/pages/PageImplementations.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("PageImplementations.tsx", pageText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["getSessionLabel", "getGradeBadgeTone", "compareRaces", "compareTodayRacesBySession", "compareUpcomingScheduleRaces", "formatShortDateRange",
  "isRecord", "readString", "normalizeGradedRaceText", "normalizeScheduleGrade", "normalizeScheduleSession", "normalizeScheduleSource",
  "getScheduleSourceLabel", "getScheduleTitleLabel", "hasValidSchedulePeriod", "normalizeScheduleProvenance", "normalizeUpcomingScheduleItem",
  "normalizeUpcomingScheduleFeed", "getScheduleDisplaySessionLabel", "getScheduleFeedNotices", "getScheduleTargetDate", "getDaysBetweenIso",
  "getUpcomingScheduleDayLabel", "isGradedRaceScheduleItem", "getScheduleSupplementNote"];
const sections = tree.statements.filter((node) => ts.isFunctionDeclaration(node) ? names.includes(node.name?.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && names.includes(d.name.text)));
const source = sections.map((node) => node.getText(tree)).join("\n");
const context = { exports: {}, Date, Intl, TODAY: "2026-11-19", UPCOMING_SCHEDULE_TO: "2027-01-18" };
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText;
vm.runInNewContext(javascript + names.map((name) => `\nexports.${name} = ${name};`).join(""), context);
const h = context.exports;
const candidatePath = process.env.SCHEDULE_CANDIDATE_JSON;
assert.ok(candidatePath, "SCHEDULE_CANDIDATE_JSON must point to the saved stage-1 candidate");
const candidateBytes = await fs.readFile(candidatePath);
const candidate = JSON.parse(candidateBytes);
const originalCandidateHash = sha256(candidateBytes);
const ctc = JSON.parse(await fs.readFile(new URL("../public/data/races/upcoming-schedule.generated.json", import.meta.url), "utf8"));
const normalized = h.normalizeUpcomingScheduleFeed(candidate);
const sample = candidate.items[0];
const plain = (value) => JSON.parse(JSON.stringify(value));

test("all selected production helpers are loaded from TypeScript AST", () => assert.equal(Object.keys(h).length, names.length));
for (const [session, label] of [["morning", "モーニング"], ["day", "デイ"], ["night", "ナイター"], ["midnight", "ミッドナイト"], ["unknown", "時間帯未確認"], ["garbage", "時間帯未確認"], [undefined, "時間帯未確認"]]) {
  test(`display session ${session}`, () => {
    assert.equal(h.getSessionLabel(session), label);
    assert.equal(h.getSessionLabel(h.normalizeScheduleSession(session)), label);
  });
}
for (const [source, label] of [["ctc", "CTC"], ["manual", "手入力"], ["keirin-jp", "KEIRIN.JP公式"], ["legacy", "出典未確認"], [undefined, "出典未確認"]]) {
  test(`source ${source} never silently becomes CTC`, () => assert.equal(h.getScheduleSourceLabel(h.normalizeScheduleSource(source)), label));
}
test("legacy CTC and manual morning notes remain compatible", () => {
  for (const source of ["ctc", "manual"]) {
    assert.equal(h.normalizeScheduleSession("day", "モーニング・ガールズ", source), "morning");
    assert.equal(h.normalizeScheduleSession("day", "ナイター", source), "night");
    assert.equal(h.normalizeScheduleSession("day", "ミッドナイト", source), "midnight");
  }
});
test("explicit unknown and invalid values do not inherit legacy notes", () => {
  for (const source of ["ctc", "manual", "keirin-jp", "unknown"]) {
    assert.equal(h.normalizeScheduleSession("unknown", "モーニング", source), "unknown");
    assert.equal(h.normalizeScheduleSession("bad", "モーニング", source), "unknown");
  }
  assert.equal(h.normalizeScheduleSession("unknown", "ナイター", "keirin-jp"), "unknown");
});
test("conflicting legacy notes are not assigned a session", () => assert.equal(h.normalizeScheduleSession("day", "ナイター・モーニング", "ctc"), "unknown"));
test("all supported grade aliases remain supported", () => {
  for (const [input, expected] of [["GP", "GP"], ["G1", "GI"], ["GⅡ", "GII"], ["G3", "GIII"], ["FI", "F1"], ["FII", "F2"]]) {
    assert.equal(h.normalizeScheduleGrade(input), expected);
  }
});
test("missing and unknown grades are held, never F2", () => {
  for (const grade of [undefined, "", "unknown", "G9", 2]) {
    assert.equal(h.normalizeScheduleGrade(grade), null);
    assert.equal(h.normalizeUpcomingScheduleItem({ ...sample, grade }), null);
  }
});
test("stage-1 candidate remains 155 separate meetings", () => {
  assert.equal(normalized.length, 155); assert.equal(new Set(normalized.map((x) => x.id)).size, 155);
  assert.equal(normalized.every((x) => x.source === "keirin-jp"), true);
});
test("13 unpublished titles remain empty and display-only placeholders", () => {
  const items = normalized.filter((x) => x.title === "");
  assert.equal(items.length, 13);
  assert.equal(items.every((x) => h.getScheduleTitleLabel(x) === "名称未公表"), true);
  assert.equal(candidate.items.filter((x) => x.title === "").length, 13);
});
test("40 unknown sessions remain unknown", () => {
  const items = normalized.filter((x) => x.session === "unknown");
  assert.equal(items.length, 40);
  assert.equal(items.every((x) => h.getScheduleDisplaySessionLabel(x) === "時間帯未確認"), true);
});
test("candidate metadata is preserved exactly without invented fields", () => {
  for (const item of normalized) {
    const raw = candidate.items.find((x) => x.id === item.id);
    assert.deepEqual(plain(item.provenance), raw.provenance);
    assert.equal(item.venueCode, raw.venueCode); assert.equal(item.operationStatus, "unverified");
  }
  const item = h.normalizeUpcomingScheduleItem({ ...sample, provenance: undefined, source: "not-known" });
  assert.equal(item.source, "unknown"); assert.equal(item.provenance, undefined);
});
test("CTC published data retains source and correct legacy labels", () => {
  const items = h.normalizeUpcomingScheduleFeed(ctc);
  assert.equal(items.length, 32);
  for (const item of items) {
    const raw = ctc.items.find((x) => x.id === item.id);
    assert.equal(item.source, "ctc"); assert.equal(item.title, raw.title); assert.equal(item.grade, raw.grade);
    const expected = raw.note?.includes("モーニング") ? "morning" : raw.session;
    assert.equal(item.session, expected);
  }
});
test("blocked candidate feed is never normalized as successful data", () => {
  assert.equal(h.normalizeUpcomingScheduleFeed({ ...candidate, dataValidationPassed: false }).length, 0);
  assert.equal(h.normalizeUpcomingScheduleFeed({ ...candidate, dataValidationPassed: undefined }).length, 0);
});
test("invalid periods and explicit period conflicts are held", () => {
  for (const values of [{ endDate: "2020-01-01" }, { startDate: "2026-02-30" }, { periodStatus: "conflict" }, { validationStatus: "held" }]) {
    assert.equal(h.normalizeUpcomingScheduleItem({ ...sample, ...values }), null);
    assert.equal(h.getUpcomingScheduleDayLabel({ ...sample, ...values }), "日程未確認");
  }
});
test("operation-change uncertainty cannot produce an inferred final day", () => {
  for (const operationStatus of ["changed", "cancelled", "postponed", "conflict"]) {
    assert.equal(h.getUpcomingScheduleDayLabel({ ...sample, operationStatus }), "日程未確認");
  }
});
test("month/year crossings keep periods and use planned day labels", () => {
  for (const [startDate, endDate, today] of [["2026-10-30", "2026-11-01", "2026-11-01"], ["2026-12-30", "2027-01-01", "2027-01-01"]]) {
    const item = h.normalizeUpcomingScheduleItem({ ...sample, startDate, endDate });
    assert.equal(item.startDate, startDate); assert.equal(item.endDate, endDate);
    assert.equal(h.getUpcomingScheduleDayLabel(item, today), "予定・3日目・最終日");
  }
});
test("day-label calculation preserves legacy behavior", () => {
  const item = { ...sample, source: "manual", operationStatus: undefined, startDate: "2026-11-19", endDate: "2026-11-21" };
  assert.equal(h.getUpcomingScheduleDayLabel(item, "2026-11-19"), "初日");
  assert.equal(h.getUpcomingScheduleDayLabel(item, "2026-11-20"), "2日目");
  assert.equal(h.getUpcomingScheduleDayLabel(item, "2026-11-21"), "3日目・最終日");
});
test("old CTC data warns instead of appearing freshly fetched", () => {
  const notices = h.getScheduleFeedNotices(ctc, h.normalizeUpcomingScheduleFeed(ctc), new Date("2026-11-19T06:00:00Z"));
  assert.match(notices.join(" "), /古い取得日時/);
  assert.doesNotMatch(notices.join(" "), /KEIRIN.JP公式/);
});
test("fresh file generation cannot mask old raw acquisition time", () => {
  const notices = h.getScheduleFeedNotices({ generatedAt: "2026-11-19T05:00:00Z" }, [{ ...normalized[0], provenance: [{ fetchedAt: "2026-10-23T00:00:00Z" }] }], new Date("2026-11-19T06:00:00Z"));
  assert.match(notices.join(" "), /古い取得日時/);
});
test("fresh KEIRIN.JP feed time cannot be borrowed by a CTC row", () => {
  const notices = h.getScheduleFeedNotices({ source: candidate.source, generatedAt: "2026-11-19T05:00:00Z" },
    [{ ...normalized[0], source: "ctc", provenance: undefined }], new Date("2026-11-19T06:00:00Z"));
  assert.match(notices.join(" "), /取得日時未確認/);
});
test("missing/future acquisition times do not appear verified fresh", () => {
  for (const generatedAt of [undefined, "invalid", "2027-01-01T00:00:00Z"]) {
    assert.match(h.getScheduleFeedNotices({ generatedAt }, [{ ...normalized[0], provenance: undefined }], new Date("2026-11-19T06:00:00Z")).join(" "), /取得日時未確認/);
  }
});
test("candidate and unverified operation status are explicit", () => {
  const notices = h.getScheduleFeedNotices(candidate, normalized, new Date("2026-11-19T09:00:00Z")).join(" ");
  assert.match(notices, /隔離検証用/); assert.match(notices, /中止・順延・日程変更/);
});
test("held grade and period rows are counted in notices", () => {
  const feed = { items: [{ ...sample, grade: "bad" }, { ...sample, endDate: "2000-01-01" }] };
  assert.match(h.getScheduleFeedNotices(feed, []).join(" "), /2開催は表示を保留/);
});
test("new sessions sort safely and existing session order is unchanged", () => {
  const items = ["unknown", "midnight", "night", "day", "morning"].map((session) => ({ ...normalized[0], session }));
  assert.deepEqual(items.sort(h.compareTodayRacesBySession).map((x) => x.session), ["morning", "day", "night", "midnight", "unknown"]);
});

let article;
function visit(node) {
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "article"
    && node.openingElement.attributes.properties.some((attr) => ts.isJsxAttribute(attr) && attr.name.getText(tree) === "data-schedule-id")) article = node;
  ts.forEachChild(node, visit);
}
visit(tree);
assert.ok(article, "production upcoming card JSX not found");
const renderCode = ts.transpileModule(`exports.Render = () => (${article.getText(tree)});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function renderCard(item) {
  const scope = { exports: {}, require: createRequire(import.meta.url), ...h, item,
    dayLabel: h.getUpcomingScheduleDayLabel(item), supplementNote: h.getScheduleSupplementNote(item),
    hasScheduleFavorite: false, scheduleFavoriteItems: [], hasFinderFilters: false, isMobile: false };
  vm.runInNewContext(renderCode, scope);
  return renderToStaticMarkup(React.createElement(scope.exports.Render));
}
test("actual card JSX renders all 155 official candidates, including 13 blank titles", async () => {
  const rendered = normalized.map(renderCard);
  assert.equal(rendered.filter((text) => text.includes("名称未公表")).length, 13);
  assert.equal(rendered.every((text) => text.includes("KEIRIN.JP公式")), true);
  assert.equal(rendered.filter((text) => text.includes("時間帯未確認")).length, 40);
  if (process.env.SCHEDULE_DISPLAY_EVIDENCE) {
    await fs.writeFile(path.join(process.env.SCHEDULE_DISPLAY_EVIDENCE, "rendered-candidate-cards.html"),
      `<!doctype html><html lang="ja"><meta charset="utf-8"><title>隔離候補表示検証</title><body><main style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px">${rendered.join("")}</main></body></html>`, { flag: "wx" });
  }
});
test("actual card JSX separates manual/CTC/unknown sources", () => {
  for (const source of ["ctc", "manual", "unknown"]) {
    const text = renderCard({ ...normalized[0], source });
    assert.ok(text.includes(h.getScheduleSourceLabel(source))); assert.ok(!text.includes("KEIRIN.JP公式"));
  }
});
test("top upcoming filter remains G-grade only", () => {
  const items = normalized.filter(h.isGradedRaceScheduleItem);
  assert.ok(items.length > 0); assert.equal(items.every((x) => ["GP", "GI", "GII", "GIII"].includes(x.grade)), true);
});
test("candidate original remains unchanged", async () => assert.equal(sha256(await fs.readFile(candidatePath)), originalCandidateHash));

test("isolated production-build browser display", { skip: process.env.SCHEDULE_EDGE_TEST !== "1", timeout: 120000 }, async () => {
  const { chromium } = await import(pathToFileURL(process.env.SCHEDULE_PLAYWRIGHT_MODULE).href);
  const { preview } = await import("vite");
  const output = process.env.SCHEDULE_DISPLAY_EVIDENCE;
  assert.ok(output);
  const report = { mode: "isolated-production-build", candidateSha256: originalCandidateHash, scenarios: [], console: [],
    pageErrors: [], httpErrors: [], blockedExternal: [], requestFailures: [], scheduleResponses: [] };
  let server, browser;
  try {
    server = await preview({ root, mode: "github", preview: { host: "127.0.0.1", port: 0, open: false } });
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ executablePath: process.env.SCHEDULE_EDGE_PATH, headless: true });
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const ctx = await browser.newContext({ viewport, timezoneId: "Asia/Tokyo" });
      await ctx.addInitScript(() => {
        const OriginalDate = Date, fixed = "2026-11-19T08:00:00Z";
        window.Date = class extends OriginalDate {
          constructor(...args) { super(...(args.length ? args : [fixed])); }
          static now() { return new OriginalDate(fixed).getTime(); }
        };
      });
      let selected = candidate;
      await ctx.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) {
          report.blockedExternal.push(url.href);
          return route.abort();
        }
        if (url.pathname.endsWith("/data/races/upcoming-schedule.generated.json")) {
          const body = JSON.stringify(selected);
          report.scheduleResponses.push({ url: url.href, status: 200, bodySha256: sha256(body),
            kind: selected === candidate ? "official-candidate" : selected === ctc ? "existing-ctc" : "synthetic-uncertainty-fixture" });
          return route.fulfill({ status: 200, contentType: "application/json", body });
        }
        return route.continue();
      });
      const page = await ctx.newPage();
      page.setDefaultTimeout(15000);
      page.on("console", (message) => { if (message.type() === "error") report.console.push(message.text()); });
      page.on("pageerror", (error) => report.pageErrors.push(error.stack ?? error.message));
      page.on("requestfailed", (request) => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
      page.on("response", (response) => { if (response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() }); });
      await page.goto(`${origin}/keirin-datalavo/#dashboard`, { waitUntil: "domcontentloaded" });
      const cards = page.locator('[data-testid="upcoming-schedule-list"] article');
      await page.locator('[data-schedule-source="keirin-jp"]').first().waitFor();
      assert.equal(await cards.count(), normalized.filter(h.isGradedRaceScheduleItem).slice(0, 10).length);
      assert.ok((await cards.allTextContents()).every((text) => text.includes("KEIRIN.JP公式")));
      await page.locator('[data-testid="upcoming-schedule-list"]').screenshot({ path: path.join(output, `official-${viewport.width}.png`) });
      report.scenarios.push({ kind: "official-candidate", viewport, cards: await cards.count(), pass: true });
      selected = ctc;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-schedule-source="ctc"]').first().waitFor();
      assert.ok((await page.locator('[data-testid="upcoming-schedule-notices"]').innerText()).includes("古い取得日時"));
      assert.ok((await cards.allTextContents()).every((text) => text.includes("CTC") && !text.includes("KEIRIN.JP公式")));
      report.scenarios.push({ kind: "existing-ctc", viewport, cards: await cards.count(), staleWarning: true, pass: true });
      const graded = candidate.items.find((x) => ["GP", "GI", "GII", "GIII"].includes(x.grade));
      selected = { items: [{ ...graded, id: "synthetic-unknown-source", source: "unrecognized", session: "unrecognized", title: "", provenance: undefined },
        { ...graded, id: "synthetic-unknown-grade", grade: "unrecognized" }] };
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator('[data-schedule-source="unknown"]').first().waitFor();
      assert.equal(await cards.count(), 1);
      const text = await cards.first().innerText();
      for (const label of ["出典未確認", "時間帯未確認", "名称未公表"]) assert.ok(text.includes(label));
      assert.ok((await page.locator('[data-testid="upcoming-schedule-notices"]').innerText()).includes("1開催は表示を保留"));
      await page.locator('[data-testid="upcoming-schedule-list"]').screenshot({ path: path.join(output, `synthetic-unknown-${viewport.width}.png`) });
      report.scenarios.push({ kind: "synthetic-uncertainty-fixture", viewport, pass: true });
      await ctx.close();
    }
    assert.equal(report.pageErrors.length, 0);
    assert.equal(report.httpErrors.length, 0);
    assert.equal(report.requestFailures.filter((x) => new URL(x.url).origin === origin).length, 0);
    assert.equal(report.requestFailures.every((x) => report.blockedExternal.includes(x.url)), true);
    assert.equal(report.console.every((text) => text === "Failed to load resource: net::ERR_FAILED"), true);
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error.stack; throw error; }
  finally {
    await browser?.close();
    if (server) await new Promise((resolve) => server.httpServer.close(resolve));
    report.browserClosed = Boolean(browser && !browser.isConnected());
    report.serverClosed = Boolean(server && !server.httpServer.listening);
    await fs.writeFile(path.join(output, "browser-result.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  }
});
