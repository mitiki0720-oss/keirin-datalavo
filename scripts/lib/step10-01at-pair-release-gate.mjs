/** STEP10-01AT — review-only atomic feed-pair preflight. Pure and fail-closed.
 * WARNING: validates producer/manifest consistency; never substitutes for
 * independent KEIRIN.JP rider/profile verification or production browser QA.
 */
import { createHash } from 'node:crypto';
const clean = x => String(x ?? '').normalize('NFKC').trim();
const unsigned = x => { const s=clean(x); return /^\d+$/u.test(s) ? String(Number(s)) : ''; };
const officialId = x => /^[0-9]{5,6}$/u.test(String(x ?? ''));
const riderName = x => clean(x).replace(/[\s\u3000・]/gu,'');
const isoMs = x => typeof x==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(x) ? Date.parse(x) : NaN;
const key = (d,v,r,c) => [clean(d),unsigned(v),unsigned(r),unsigned(c)].join('|');
const fail = (code,meta={}) => ({status:'HOLD',code,...meta});
export function verifyPairedOfficialRelease(officialBytes,today) {
  if (!Buffer.isBuffer(officialBytes) && !(officialBytes instanceof Uint8Array)) return fail('OFFICIAL_BYTES_MISSING');
  let official;
  try { official=JSON.parse(Buffer.from(officialBytes).toString('utf8')); } catch { return fail('OFFICIAL_JSON_INVALID'); }
  const digest=createHash('sha256').update(officialBytes).digest('hex');
  if (official?.source?.provider!=='KEIRIN.JP' || official.source.entryType!=='JSJ006' || official.source.detailType!=='JSJ001'
      || !/^\d{4}-\d\d-\d\d$/u.test(official.date) || official.date!==today?.date)
    return fail('OFFICIAL_SCHEMA_OR_DATE_MISMATCH');
  if (today?.source?.officialEntriesSha256!==digest) return fail('OFFICIAL_SHA_MANIFEST_MISMATCH',{officialSha256:digest});
  const start=isoMs(official.source.fetchStartedAt),end=isoMs(official.source.fetchCompletedAt);
  if (!Number.isFinite(start)||!Number.isFinite(end)||start>end) return fail('SOURCE_FETCH_WINDOW_INVALID');
  // Producer may preserve a race from a previous invocation. Reject it unless
  // it was truly rechecked during this exact fetch window (never backfill proof).
  if (Number(official.preservedCompleteRaceCount||0)>0) return fail('PRESERVED_PRIOR_RACES',{preserved:official.preservedCompleteRaceCount});
  if (!Array.isArray(official.venues)||!official.venues.length||!Array.isArray(today.venues))return fail('VENUES_MISSING');
  const ids=new Map(), raceKeys=new Set(),venueKeys=new Set();let races=0;
  for(const v of official.venues){
    const vc=unsigned(v.venueCode);
    if(v.date!==official.date||!vc||venueKeys.has(vc)||!Array.isArray(v.races)||!v.races.length) return fail('VENUE_INVALID_OR_DUPLICATE');
    venueKeys.add(vc);
    for(const r of v.races){
      const rn=unsigned(r.raceNumber),rk=key(official.date,vc,rn,0);
      if(!rn||raceKeys.has(rk)||r.entryStatus!=='available'||!Array.isArray(r.entries)||!r.entries.length)return fail('RACE_INVALID_OR_MISSING');
      raceKeys.add(rk);races++;
      const proof=r.quality?.entryDetailCrosscheck,when=isoMs(proof?.checkedAt);
      if(proof?.status!=='PASS_JSJ001_JSJ006_EXACT'||proof.date!==official.date||unsigned(proof.venueCode)!==vc||unsigned(proof.raceNo)!==rn
         ||proof.rowCount!==r.entries.length||proof.entryType!=='JSJ006'||proof.detailType!=='JSJ001'
         ||!Number.isFinite(when)||when<start||when>end)return fail('RACE_ATTESTATION_MISSING_OR_STALE',{race:rk});
      const idsInRace=new Set();
      for(const e of r.entries){
        const car=unsigned(e.carNo),id=e.registrationNo,k=key(official.date,vc,rn,car);
        if(!/^[1-9]$/u.test(car)||!officialId(id)||e.source!=='KEIRIN.JP:JSJ006'||!riderName(e.name)||ids.has(k)||idsInRace.has(id))return fail('RIDER_ID_OR_KEY_INVALID',{race:rk});
        ids.set(k,{id,name:riderName(e.name)});idsInRace.add(id);
      }
    }
  }
  let matched=0;const matchedKeys=new Set();const feedRaces=new Set();
  for(const v of today.venues){
    const vc=unsigned(v.venueCode);
    for(const r of v.races??[]){
      const rn=unsigned(r.raceNo),rk=key(today.date,vc,rn,0);
      if(feedRaces.has(rk)) return fail('TODAY_RACE_DUPLICATE');feedRaces.add(rk);
      if(!Array.isArray(r.riders)||!r.riders.length) return fail('TODAY_RIDERS_MISSING',{race:rk});
      for(const rider of r.riders){
        const k=key(today.date,vc,rn,rider.carNo),expected=ids.get(k);
        if(!expected||matchedKeys.has(k)||expected.id!==rider.registrationNo||expected.name!==riderName(rider.fullName??rider.name))
          return fail('TODAY_RIDER_IDENTITY_MISMATCH',{race:rk});
        matchedKeys.add(k);matched++;
      }
    }
  }
  if(matched!==ids.size||feedRaces.size!==races)return fail('TODAY_COVERAGE_MISMATCH',{officialRaces:races,officialRiders:ids.size,todayRiders:matched,todayRaces:feedRaces.size});
  return {status:'PASS_REVIEW_PAIR',officialSha256:digest,races,riders:matched,
    evidence:'internally generated feed attestation only; not independently verified official player profiles'};
}
