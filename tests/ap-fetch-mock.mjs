/** TEST ONLY. Mock KEIRIN.JP JSON replies for the real generator process. */
const variant=process.env.AP_MOCK_CASE || 'normal';
const rows=[
 {syaban:'1',sensyuRegistNo:'014032',sensyuName:'藤田 真',huKen:'兵 庫',sotugyouki:'89',kyuhan:'A1'},
 {syaban:'2',sensyuRegistNo:'12345',sensyuName:'テスト 選手',huKen:'東 京',sotugyouki:'99',kyuhan:'A1'},
];
const raceRows=rows.map(r=>({carNum:r.syaban,numPlayer:r.sensyuRegistNo}));
if(variant==='wrong-id')raceRows[0].numPlayer='888888';
if(variant==='duplicate-detail')raceRows.push({...raceRows[0]});
if(variant==='wrong-date')raceRows[0].numPlayer=raceRows[0].numPlayer; // fixture changes JSJ001 date below
const ok=(data)=>({ok:true,status:200,statusText:'OK',json:async()=>data});
globalThis.fetch=async (input)=>{
 const url=new URL(String(input));
 if(url.hostname!=='keirin.jp'||url.pathname!=='/pc/json')throw Error('unexpected external mock URL '+url);
 const type=url.searchParams.get('type'), enc=url.searchParams.get('encp');
 if(type==='JSJ048')return ok({RaceList:[{kaisaiDate:'20261105',touhyouLivePara:'mock-venue',keirinjoName:'大垣'}]});
 if(type==='JSJ001'&&enc==='mock-venue')return ok({C0201data:{selKaisai:'20261105',selKjyoCd:'42',joName:'大垣',C0201race:[{raceNo:1,encParaR:'mock-race',raceName:'A級予選'}]}});
 if(type==='JSJ006'&&enc==='mock-race')return ok({bKeirinjyoCd:'42',sensyuTypeInfo:rows});
 if(type==='JSJ001'&&enc==='mock-race')return ok({C0201data:{selKaisai:variant==='wrong-date'?'20261106':'20261105',selKjyoCd:'42',selRaceNo:1,C0201racedtl:{C0201sensyu:raceRows,syumoku:'A級予選',aftStartTime:'11:00'}}});
 if(type==='JSJ005'&&enc==='mock-race')return ok({narabiyoso:{shaban:[{ichi:1,shaban:'1'},{ichi:2,shaban:'2'}]}});
 throw Error('unexpected data request type='+type+' enc='+enc);
};
