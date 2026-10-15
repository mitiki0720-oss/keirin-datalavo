import assert from "node:assert/strict";
import {
  classifyInputFile,
  extractLabeledValue,
  mergeResultFromBlocks,
  parseRaceMeta,
  parseResultBlock,
  normalizeVenueName,
  splitRaceBlocks,
} from "./kurari-ex-history-common.mjs";

const legacy = `■ 防府 1R
レース名: A級予選
着順: 5-4-7
1着: 5 選手A
2着: 4 選手B
3着: 7 選手C
3連単: 5-4-7 28,980円
`;
const legacyBlocks = splitRaceBlocks(legacy, "result");
assert.equal(legacyBlocks.length, 1);
assert.equal(legacyBlocks[0].raceNumber, 1);
assert.equal(parseResultBlock(legacyBlocks[0].text).status, "finished");

const review = `【Review結果まとめ】
対象日: 2026-10-04
対象会場: 防府
【1R】
【結果判定】
日付: 2026-10-04
会場: 防府
R: 1R
レース名: A級予選
結果確定ステータス: confirmed
3連単照合キー: 5-4-7
【実際の結果】
着順: 5-4-7
1着: 5 選手A
2着: 4 選手B
3着: 7 選手C
1着の決まり手: 差
【払戻】
3連単: 5-4-7 28,980円
【source】
source名: official-result
source取得日時: 2026-10-04T12:00:00+09:00
source種別: official
official source: keirin.jp
【2R】
【結果判定】
日付: 2026-10-04
会場: 防府
R: 2R
結果確定ステータス: pending
3連単照合キー: 1-2-3
着順: 1-2-3
1着: 1 選手D
2着: 2 選手E
3着: 3 選手F
`;
const reviewBlocks = splitRaceBlocks(review, "result");
assert.deepEqual(reviewBlocks.map((block) => block.raceNumber), [1, 2]);
assert.equal(reviewBlocks[0].format, "review-result");
assert.equal(extractLabeledValue(reviewBlocks[0].text, ["日付"]), "2026-10-04");
assert.equal(extractLabeledValue(reviewBlocks[0].text, ["会場"]), "防府");
assert.equal(extractLabeledValue(reviewBlocks[0].text, ["source名"]), "official-result");
assert.equal(extractLabeledValue(reviewBlocks[0].text, ["source取得日時"]), "2026-10-04T12:00:00+09:00");
assert.equal(parseRaceMeta(null, reviewBlocks[0].text).raceTitle, "A級予選");
const first = parseResultBlock(reviewBlocks[0].text);
assert.equal(first.status, "finished");
assert.deepEqual([first.first.carNo, first.second.carNo, first.third.carNo], [5, 4, 7]);
assert.equal(first.first.winningMethod, "差");
assert.equal(first.trifecta.payoutYen, 28980);
assert.equal(parseResultBlock(reviewBlocks[1].text).status, "missing");
assert.equal(parseResultBlock("【1R】\n結果確定ステータス: confirmed\n着順: 未取得").status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("official source: keirin.jp", "official source: 未取得")).status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("source名: official-result", "source名: 未取得")).status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("source取得日時: 2026-10-04T12:00:00+09:00", "source取得日時: 2026-10-04")).status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("結果確定ステータス: confirmed", "結果確定ステータス: 未取得")).status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("3連単: 5-4-7 28,980円", "3連単: 5-4-7 未取得")).status, "missing");
assert.equal(parseResultBlock(reviewBlocks[0].text.replace("3連単: 5-4-7 28,980円", "3連単: 5-7-4 28,980円")).status, "missing");
assert.equal(mergeResultFromBlocks(parseResultBlock(legacy), parseResultBlock(reviewBlocks[1].text), "review-result").status, "missing");
assert.equal(mergeResultFromBlocks(parseResultBlock(legacy), null, undefined).status, "finished");
assert.throws(() => splitRaceBlocks(`${review}\n【1R】\n`, "result"), /duplicate result race heading/u);
const classified = classifyInputFile("/raw/2026-10-12/2026-10-12-kumamoto-results.txt", "/raw");
assert.equal(classified.venueName, "熊本");
assert.equal(classified.date, "2026-10-12");
assert.equal(normalizeVenueName("熊本競輪場"), normalizeVenueName("熊本"));
assert.equal(extractLabeledValue("R: 7", ["R"]), "7");
assert.notEqual(extractLabeledValue("R: 8", ["R"]), "7");
assert.equal(classifyInputFile("/raw/2026-10-11/2026-10-12-kumamoto-results.txt", "/raw").classified, false);

console.log("KURARI EX legacy/review result text parser fixtures passed");
