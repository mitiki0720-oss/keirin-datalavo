import assert from 'node:assert/strict';
import {assertJsj001Jsj006Exact} from '../scripts/lib/official-entry-crosscheck.mjs';
const valid = {
  date:'2026-11-05', venueCode:'42', raceNumber:1,
  entryVenueCode:'42',detailDate:'20261105',detailVenueCode:'42',detailRaceNumber:1,
  entries:[{carNo:'1',registrationNo:'014032',name:'佐藤'} ,{carNo:'2',registrationNo:'12345',name:'鈴木'}],
  detailRiders:[{carNum:'1',numPlayer:'014032'},{carNum:'2',numPlayer:'12345'}],
};
const tests = [
 ['normal',x=>{}],['alternate row order',x=>x.detailRiders.reverse()],
 ['detail date mismatch',x=>x.detailDate='20261106'],
 ['parent date bad',x=>x.date='2026-11-06'],
 ['venue mismatch',x=>x.detailVenueCode='43'],['entry venue mismatch',x=>x.entryVenueCode='43'],
 ['race mismatch',x=>x.detailRaceNumber=2],['parent race invalid',x=>x.raceNumber=13],
 ['detail duplicate car',x=>x.detailRiders[1].carNum='1'],
 ['entry duplicate car',x=>x.entries[1].carNo='1'],
 ['detail duplicate ID',x=>x.detailRiders[1].numPlayer='014032'],
 ['entry duplicate ID',x=>x.entries[1].registrationNo='014032'],
 ['number substitution',x=>x.detailRiders[1].numPlayer='99999'],
 ['car swap',x=>x.detailRiders[1].carNum='3'],
 ['detail extra row',x=>x.detailRiders.push({carNum:'3',numPlayer:'77777'})],
 ['entry extra row',x=>x.entries.push({carNo:'3',registrationNo:'77777',name:'第三'})],
 ['5-digit accepted',x=>x.detailRiders[1].numPlayer='12345'],
 ['missing name',x=>x.entries[0].name=''],
 ['ID 4 digits',x=>{x.entries[0].registrationNo='4321';x.detailRiders[0].numPlayer='4321'}],
 ['ID 7 digits',x=>{x.entries[0].registrationNo='0123456';x.detailRiders[0].numPlayer='0123456'}],
 ['zero-padding impostor',x=>x.detailRiders[0].numPlayer='14032'],
 ['unverified official extra entry',x=>x.detailRiders.push({carNum:'1',numPlayer:'014032'})],
 ['missing detail rows',x=>x.detailRiders=[]],
 ['missing official rows',x=>x.entries=[]],
 ['not a real JSJ date',x=>x.detailDate='not-a-date'],
 ['zero car',x=>x.entries[0].carNo='0'],
 ['source undefined date',x=>delete x.date],
 ['misleading NFKC ID',x=>x.entries[0].registrationNo='０１４０３２'],
];
let passed=0;
for(const [name,mutate] of tests){
 const x=structuredClone(valid);mutate(x);const success=['normal','alternate row order','5-digit accepted'].includes(name);
 if(success){assert.equal(assertJsj001Jsj006Exact(x).status,'PASS_JSJ001_JSJ006_EXACT',name)}
 else assert.throws(()=>assertJsj001Jsj006Exact(x),/identity check failed/,name);
 passed++;
}
console.log(JSON.stringify({cases:passed,passed,positive:3,negative:25,kind:'synthetic',liveJsj001:false,source:'AP local helper'}));
