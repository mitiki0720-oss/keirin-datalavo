import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { fetchExpectedListData, getOfficialResultListDates, fetchVenue, validateOfficialResultIdentity, createRaceResult, mergeWithExisting } from './update-keirin-jp-results.mjs';
import { indexOfficialTodayResults } from './lib/official-today-source.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keirin-results-date-test-'));
const target = '2026-11-20', previous = '2026-11-19';
const venue = date => ({ kaisaiDate: date.replaceAll('-', ''), naibuKeirinCd: '81', keirinjoName: '小倉', touhyouLivePara: 'venue-' + date, gradeIconName: 'F2' });
const list = date => ({ resultCd: 0, RaceList: [venue(date)] });
const index = (date, no = 1) => ({ resultCd: 0, C0201data: { selKaisai: date.replaceAll('-', ''), selKjyoCd: '81', joName: '小倉競輪場', selRaceNo: no, C0201race: [{ raceNo: '1', encParaR: 'race-' + date, flgRaceEnd: true }], C0201racedtl: { C0201sensyu: Array.from({ length: 5 }, (_, i) => ({ carNum: i + 1, numPlayer: `00000${i + 1}` })) } } });
const entries = () => ({ resultCd: 0, bKeirinjyoCd: '81', sensyuTypeInfo: Array.from({ length: 5 }, (_, i) => ({ syaban: String(i + 1), sensyuRegistNo: `00000${i + 1}`, sensyuName: `選手${i + 1}` })) });
const result = () => ({ resultCd: 0, tyakujyunDispFlg: true, haraiGakuDispFlg: true, tyakujyunItemSubData: entries().sensyuTypeInfo.map((r, i) => ({ ...r, tyaku: String(i + 1) })), haraiGakuSubData: { ST2HaraiGakuDispItemSubData: [{ kumiBan: '1-2', haraiGaku: '300' }], RT3HaraiGakuDispItemSubData: [{ kumiBan: '1-2-3', haraiGaku: '1000' }] } });
const unpublished = () => ({ resultCd: 0, tyakujyunDispFlg: false, haraiGakuDispFlg: false });
function service({ switched = false, pending = false } = {}) {
  return async url => {
    const type = url.searchParams.get('type'), parameter = url.searchParams.get('encp');
    if (type === 'JSJ048') return list(url.searchParams.get('kaisaibikbn') === '0' && !switched ? previous : target);
    const date = parameter.endsWith(target) ? target : previous;
    if (type === 'JSJ001') return index(date);
    if (type === 'JSJ006') return entries();
    if (type === 'JSJ012') return pending ? unpublished() : result();
    throw new Error('Unexpected request');
  };
}
const preload = path.join(root, 'mock-http.mjs');
fs.writeFileSync(preload, `import fs from 'node:fs';
const fixture=JSON.parse(fs.readFileSync(process.env.DATE_TEST_CONFIG,'utf8'));
const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixture.now]));}static now(){return NativeDate.parse(fixture.now);}};
globalThis.fetch=async input=>{const u=new URL(input);const type=u.searchParams.get('type'),key=type==='JSJ048'?'list:'+u.searchParams.get('kaisaibikbn'):type+':'+u.searchParams.get('encp');if(!fixture.responses[key])throw new Error('Unexpected mock request '+key);return new Response(JSON.stringify(fixture.responses[key]),{status:200,headers:{'content-type':'application/json'}});};
`);
const baselineDir = path.join(root, 'baseline'); fs.mkdirSync(baselineDir);
const baselineFile = path.join(baselineDir, 'update-keirin-jp-results.mjs');
// Immutable pre-fix CLI from df5d81b5d236f0b7ae8b33203cb633025a3b6384; executed only by the old-CLI test cases.
const baselineCli = gunzipSync(Buffer.from([
  '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',
  'CFNH0M6ykmCtP1UEpwzX+MYwdJAUuQMGx+U8+1YMzYwDyNeGIJnahNVtCzB0G1g8K7iQL8sqT7NteIFZioGTLWsVnO3Sq4Ot7eUB',
  'NN1evVUlDWtCVWB7hH77x//67b///OXzXxSubFj78qd/+Z9//qff/vLvXz7/25fP//nl85+/fP6PL5//9cvnf/jy938K2uMVOIIz',
  '2TpM0j2hLyKgHlEsioOzY63DziuqXNMaZ6KX2wharVHI0IlPdXQwMagx4UegKsxDSFGX70dvHNIbpgyKpCgvdEazq5sR0R3mKC8E',
  '9OkLksdrts7ebppB0F7arJhGPn3/Ac/k7J6bCGmvsNEdaDK8YNq5hhmZiA5idDoTTk+KHK0qo6obnuwX8wWW2aoErmYb+YZ0M7A+',
  'czmT23pGrDtXQlSZ+rytOgqliQpG11r0I6ppfJF/qsMFvm7z785DGVyZm45CVB001Ek4gQRakfxQ0DyUPY+qhy4k84VYRkF7GaHe',
  'DQkkLvtXIJHX/fiAcDWJ5pRDB/jAEqk3RHYQhodgI/dl/2q1Vjl92c3R2aQdDRtZPU9mZI5/IUzVM3a06zU/xNgTg7VOQD8cwI9d',
  'Bk45obilcMOrzMwmLtKYz5cLMrBuzpbj8nRRUFluqvymmaui0puxff22fsGbtdHUd2XeqNT4jDxqcfr1SnWqmu13i77myWJjVWyI',
  '+lLFWktR8PuPx3or+0JFUkQ5Ao19vKOSAjZ7pLe3HcGqoqhsqnm8LruCzTD3ql8VzZV+W4MRvotU//fjdNnpPtJV0GHz91Rh1UDu',
  'ui7vYvuYKyoaPrI46zCBlnaV4aJhy6+61K5VAnbqQlXEikw652kYXNo2Yr3DHJXQLXIV2BBsgIHc9RxStaf3bb3w+idY0GIDvl/7',
  'ugapayWlpFPJC53ZNTjTwe2sPYYfdajXuBYM81TShuOWcpuYugDYhujUV9dsiy2ttRNoPq6s2RlFTb9ktNOqv5pspqQeKdZQqj2I',
  'bKSkbKqdkGOBG4UxNmHqf5LaWkNZpzv694l1SfSw6e+Xvsj9vd3lzpX0RN5vPmrzETy3eD/7DNWPK+O5vJ/LXwZEOo2P4SIYmoug',
  'Lg8bOWF0k3WZ139vdQpLUdx1f//ykULbGIJyrAwG/wswoZhxwjoAAA==',
].join(''), 'base64'));
assert.equal(createHash('sha256').update(baselineCli).digest('hex'), 'd4c72d9b10aa95b77215c50e7db50caa9283b5d9de891319f0e9906e98f4b1eb', 'Pre-fix CLI fixture SHA mismatch');
fs.writeFileSync(baselineFile, baselineCli);
fs.symlinkSync(path.resolve('scripts/lib'), path.join(baselineDir, 'lib'), process.platform === 'win32' ? 'junction' : 'dir');
const evidence = [];
function cli({ now, old = false, pending = false, onlyPrevious = false, badIdentity = false, existing } = {}) {
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(now));
  const dir = fs.mkdtempSync(path.join(root, 'cli-')), output = path.join(dir, 'results.json'), config = path.join(dir, 'config.json');
  const responses = {};
  for (const kbn of ['0', '1', '-1', '2']) responses['list:' + kbn] = list(onlyPrevious || kbn === '0' ? previous : target);
  for (const day of [previous, target]) {
    responses['JSJ001:venue-' + day] = index(day); responses['JSJ001:race-' + day] = index(day);
    responses['JSJ006:race-' + day] = entries(); responses['JSJ012:race-' + day] = pending ? unpublished() : result();
  }
  if (badIdentity) responses['JSJ006:race-' + target].sensyuTypeInfo[0].sensyuRegistNo = '999999';
  fs.writeFileSync(config, JSON.stringify({ now, responses }));
  if (existing !== undefined) fs.writeFileSync(output, existing);
  const args = ['--import', pathToFileURL(preload).href, old ? baselineFile : path.resolve('scripts/update-keirin-jp-results.mjs'), '--expect-date=' + date, '--output=' + output, '--delay-ms=0'];
  const child = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000, env: { ...process.env, DATE_TEST_CONFIG: config, GITHUB_ACTIONS: 'true' } });
  const record = { now, expectedDate: date, baseline: old, pending, onlyPrevious, status: child.status, stdout: child.stdout, stderr: child.stderr };
  evidence.push(record); fs.writeFileSync(path.join(dir, 'execution.json'), JSON.stringify(record, null, 2));
  return { ...record, output, data: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null };
}
for (const [label, now, isPrevious] of [
  ['11/19 23:50', '2026-11-19T14:50:00Z', true],
  ['#10471 11/20 00:50', '2026-11-19T15:50:00Z', false],
  ['#10472 11/20 02:20', '2026-11-19T17:20:00Z', false],
  ['#10473 11/20 04:28', '2026-11-19T19:28:00Z', false],
  ['11/20 06:17', '2026-11-19T21:17:00Z', false],
]) {
  test(`old CLI reproduction: ${label}`, () => {
    const r = cli({ now, old: true }); assert.equal(r.status, isPrevious ? 0 : 1);
    if (!isPrevious) { assert.match(r.stderr, /date mismatch: expected 2026-11-20, actual 2026-11-19/); assert.equal(r.data, null); }
  });
  test(`fixed CLI picks actual target: ${label}`, async () => {
    const r = cli({ now }); assert.equal(r.status, 0, r.stderr); assert.equal(r.data.date, isPrevious ? previous : target);
    assert.equal(r.data.confirmedRaceCount, 1); assert.equal(r.data.source.kaisaiDateKbn, isPrevious ? '0' : '1');
    assert.equal(r.data.venues[0].date, r.data.date); assert.equal(r.data.venues[0].races[0].payout3tan.payoutYen, 1000);
    const choice = await fetchExpectedListData({ now: new Date(now), fetchImpl: service() }); assert.equal(choice.targetDate, r.data.date);
  });
}
test('already switched official feed uses one request', async () => {
  const r = await fetchExpectedListData({ targetDate: target, fetchImpl: service({ switched: true }) }); assert.equal(r.attempts.length, 1); assert.equal(r.kaisaiDateKbn, '0');
});
test('explicit official kbn URL is tried first without assuming its date', async () => {
  const r = await fetchExpectedListData({ targetDate: target, url: 'https://keirin.jp/pc/json?type=JSJ048&kaisaibikbn=1', fetchImpl: service() }); assert.equal(r.attempts.length, 1); assert.equal(r.kaisaiDateKbn, '1');
});
test('only previous day is a bounded explicit failure, not successful skip', async () => {
  let calls = 0; await assert.rejects(fetchExpectedListData({ targetDate: target, fetchImpl: async () => { calls++; return list(previous); } }), /OFFICIAL_TARGET_DATE_UNAVAILABLE/); assert.equal(calls, 4);
});
for (const [label, mutate, expected] of [
  ['empty', x => { x.RaceList = []; }, /INVALID_OR_EMPTY/],
  ['absent list', x => { delete x.RaceList; }, /INVALID_OR_EMPTY/],
  ['error response', x => { x.resultCd = 1; }, /INVALID_OR_EMPTY/],
  ['missing venue date', x => { delete x.RaceList[0].kaisaiDate; }, /IDENTITY_INVALID/],
  ['invalid calendar date', x => { x.RaceList[0].kaisaiDate = '20260230'; }, /IDENTITY_INVALID/],
  ['duplicate venue', x => { x.RaceList.push(structuredClone(x.RaceList[0])); }, /IDENTITY_INVALID/],
  ['mixed date list', x => { x.RaceList.push({ ...venue(previous), naibuKeirinCd: '74' }); }, /MIXED_DATES/],
]) test(`bad list is not masked as switching: ${label}`, async () => {
  let calls = 0; const data = list(target); mutate(data);
  await assert.rejects(fetchExpectedListData({ targetDate: target, fetchImpl: async () => { calls++; return data; } }), expected); assert.equal(calls, 1);
});
test('network failure stops rather than falling through to another date', async () => {
  let calls = 0; await assert.rejects(fetchExpectedListData({ targetDate: target, fetchImpl: async () => { calls++; throw new Error('HTTP 503'); } }), /HTTP 503/); assert.equal(calls, 1);
});
for (const date of ['2026-02-30', '20261120', 'not-a-date']) test(`invalid target rejected: ${date}`, async () => {
  await assert.rejects(fetchExpectedListData({ targetDate: date, fetchImpl: () => { throw new Error('must not request'); } }), /invalid target/);
});
test('unofficial source URL is rejected', async () => assert.rejects(fetchExpectedListData({ url: 'https://example.com/pc/json?type=JSJ048', targetDate: target }), /公式/));
test('target-date unpublished race stays pending and passes existing no-errors gate', () => {
  const r = cli({ now: '2026-11-19T15:50:00Z', pending: true }); assert.equal(r.status, 0, r.stderr); assert.equal(r.data.date, target); assert.equal(r.data.pendingRaceCount, 1); assert.equal(r.data.errorCount, 0); assert.equal(r.data.confirmedRaceCount, 0);
  assert.equal(indexOfficialTodayResults(r.data, target).size, 1);
  const check = spawnSync(process.execPath, ['scripts/check-keirin-jp-results.mjs', '--file=' + r.output, '--expect-date=' + target, '--require-no-errors'], { encoding: 'utf8' }); assert.equal(check.status, 0, check.stderr);
});
test('unavailable target never replaces an existing file', () => {
  const text = JSON.stringify({ protected: 'existing result bytes' });
  const r = cli({ now: '2026-11-19T15:50:00Z', onlyPrevious: true, existing: text }); assert.equal(r.status, 1); assert.match(r.stderr, /OFFICIAL_TARGET_DATE_UNAVAILABLE/); assert.equal(fs.readFileSync(r.output, 'utf8'), text);
});
test('identity failure blocks public-mode output before preserving/merging settled races', () => {
  const existing = JSON.stringify({ protected: 'old confirmed bytes' }); const r = cli({ now: '2026-11-19T15:50:00Z', badIdentity: true, existing });
  assert.equal(r.status, 1); assert.match(r.stderr, /fetch errors; public output was not written/); assert.equal(fs.readFileSync(r.output, 'utf8'), existing);
});
for (const [label, mutate] of [
  ['wrong date', x => { x.C0201data.selKaisai = '20261119'; }],
  ['wrong venue code', x => { x.C0201data.selKjyoCd = '74'; }],
  ['wrong venue name', x => { x.C0201data.joName = '高知'; }],
  ['empty race list', x => { x.C0201data.C0201race = []; }],
  ['duplicate race', x => { x.C0201data.C0201race.push({ ...x.C0201data.C0201race[0] }); }],
  ['conflicting explicit numbers', x => { x.C0201data.C0201race[0].raceNum = '2'; }],
  ['invalid explicit number', x => { x.C0201data.C0201race[0].raceNo = 'race1'; }],
  ['duplicate race parameter', x => { x.C0201data.C0201race.push({ raceNo: '2', encParaR: x.C0201data.C0201race[0].encParaR }); }],
]) test(`venue/race mapping refuses ${label}`, async () => {
  const data = index(target); mutate(data);
  await assert.rejects(fetchVenue(venue(target), { targetDate: target, fetchImpl: async () => data, sleepImpl: async () => {} }), /OFFICIAL_(VENUE|RACE)/);
});
for (const [label, mutate] of [
  ['registration', x => { x.data.tyakujyunItemSubData[0].sensyuRegistNo = '999999'; }],
  ['name', x => { x.data.tyakujyunItemSubData[0].sensyuName = '別人'; }],
  ['duplicate car', x => { x.data.tyakujyunItemSubData[1].syaban = '1'; }],
  ['entry venue', x => { x.entries.bKeirinjyoCd = '74'; }],
  ['detail race number', x => { x.detail.C0201data.selRaceNo = 2; }],
  ['detail date', x => { x.detail.C0201data.selKaisai = '20261119'; }],
  ['detail registration', x => { x.detail.C0201data.C0201racedtl.C0201sensyu[0].numPlayer = '999999'; }],
  ['result API error', x => { x.data.resultCd = 1; }],
  ['unpublished payout contradiction', x => { x.data.haraiGakuDispFlg = false; }],
]) test(`result identity/response refuses ${label}`, () => {
  const args = { raceNumber: 1, date: target, venueCode: '81', data: result(), entries: entries(), detail: index(target) }; mutate(args); assert.throws(() => validateOfficialResultIdentity(args), /OFFICIAL_/);
});
test('identity errors remain fetch errors, not pending-switch results', async () => {
  const fetch = service(); const v = await fetchVenue(venue(target), { targetDate: target, sleepImpl: async () => {}, fetchImpl: async url => {
    const data = await fetch(url); if (url.searchParams.get('type') === 'JSJ006') data.sensyuTypeInfo[0].sensyuRegistNo = '999999'; return data;
  } }); assert.equal(v.races[0].resultStatus, 'error'); assert.match(v.races[0].error, /IDENTITY/);
});
test('same-day confirmed result and payout survive a pending refresh', () => {
  const race = createRaceResult(1, {}, result()), pending = createRaceResult(1, {}, unpublished());
  const snap = (date, race) => ({ date, venues: [{ date, venueCode: '81', races: [race] }] });
  const merged = mergeWithExisting(snap(target, race), snap(target, pending)); assert.deepEqual(merged.payload.venues[0].races[0], race);
  const next = mergeWithExisting(snap(previous, race), snap(target, pending)); assert.equal(next.payload.venues[0].races[0].resultStatus, 'pending'); assert.equal(next.payload.date, target);
});
test('refund-only race is held without inventing finishers', () => {
  const data = { ...unpublished(), haraiGakuDispFlg: true, haraiGakuSubData: { RT3HaraiGakuDispItemSubData: [{ kumiBan: '全返還', haraiGaku: '全返還' }] } };
  assert.doesNotThrow(() => validateOfficialResultIdentity({ data })); assert.equal(createRaceResult(1, {}, data).resultStatus, 'pending');
});
for (const raceNo of [5, 11]) test(`recorded official special result identity ${raceNo}R`, { skip: !process.env.RESULT_STATUS_RAW_DIR }, () => {
  const root = process.env.RESULT_STATUS_RAW_DIR, read = name => JSON.parse(fs.readFileSync(path.join(root, name)));
  const data = read(`JSJ012-81R${raceNo}.json`), entry = read(`JSJ006-81R${raceNo}.json`), detail = read(`JSJ001-81R${raceNo}.json`);
  assert.doesNotThrow(() => validateOfficialResultIdentity({ raceNumber: raceNo, date: previous, venueCode: '81', data, entries: entry, detail }));
  const normalized = createRaceResult(raceNo, {}, data); assert.equal(normalized.resultStatus, 'confirmed');
  assert.equal(normalized.finishOrder.at(-1).status, raceNo === 11 ? '失格（外帯線内進入） / 落再入' : '失格（内側追い抜き）');
});
test('recorded official lists prove kbn 0 previous / kbn 1 target without live refetch', { skip: !process.env.RESULT_DATE_RAW_DIR }, async () => {
  const raw = process.env.RESULT_DATE_RAW_DIR; const zero = JSON.parse(fs.readFileSync(path.join(raw, 'JSJ048-kbn0.json'))), one = JSON.parse(fs.readFileSync(path.join(raw, 'JSJ048-kbn1.json')));
  assert.deepEqual(getOfficialResultListDates(zero), [previous]); assert.deepEqual(getOfficialResultListDates(one), [target]);
  const choice = await fetchExpectedListData({ targetDate: target, fetchImpl: async url => url.searchParams.get('kaisaibikbn') === '0' ? zero : one }); assert.equal(choice.kaisaiDateKbn, '1');
  const sample = JSON.parse(fs.readFileSync(path.join(raw, 'JSJ012-unpublished-sample.json')));
  assert.doesNotThrow(() => validateOfficialResultIdentity({ data: sample })); assert.equal(createRaceResult(1, {}, sample).resultStatus, 'pending');
});
process.on('exit', () => fs.writeFileSync(path.join(root, 'test-executions.json'), JSON.stringify(evidence, null, 2) + '\n'));
console.log('Date-selection fixture evidence: ' + root);
