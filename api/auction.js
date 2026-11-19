const crypto=require("crypto"),P=require("../players.json");
const U=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,T=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const BASE=.5,SQUAD=11,BUYS=SQUAD-1,BUDGET=100,TURN=15000,FIRST=30000,MAXTEAMS=40;
const r1=x=>Math.round(x*10)/10,sleep=ms=>new Promise(r=>setTimeout(r,ms));
const maxBid=t=>r1(t.budget-(BUYS-1-t.pl.length)*BASE),open=t=>t.pl.length<BUYS&&maxBid(t)>=BASE;
const clean=s=>String(s||"").replace(/[<>&"'`\\]/g,"").trim().slice(0,24);
const h=x=>crypto.createHash("sha256").update(String(x)).digest();
const same=(a,b)=>crypto.timingSafeEqual(h(a),h(b));
async function kv(cmd){const x=await fetch(U,{method:"POST",headers:{Authorization:"Bearer "+T},body:JSON.stringify(cmd)});return (await x.json()).result}
const load=async()=>JSON.parse(await kv(["GET","st"])||"null")||{phase:"lobby",teams:{},log:[]};
async function locked(fn){for(let i=0;i<30;i++){
 if(await kv(["SET","lock","1","NX","PX","4000"])==="OK"){try{const s=await load(),out=await fn(s);if(out!==false)await kv(["SET","st",JSON.stringify(s)]);return out}finally{await kv(["DEL","lock"])}}
 await sleep(100)}throw new Error("busy")}
function next(s,now){s.idx++;s.high=0;s.by=null;s.skip=[];s.end=now+FIRST;if(s.idx>=s.order.length||!Object.values(s.teams).some(open))s.phase="done"}
function advance(s,now){if(s.phase!=="live")return false;
 const el=Object.keys(s.teams).filter(u=>open(s.teams[u]));
 if(!el.length){s.phase="done";return true}
 const all=el.filter(u=>u!==s.by).every(u=>s.skip.includes(u));
 if(now>s.end||all){const n=P[s.order[s.idx]];
  if(s.by){const t=s.teams[s.by];t.pl.push({n,p:s.high});t.budget=r1(t.budget-s.high);s.log.unshift(n+" → "+t.team+" ("+s.high+"M)")}
  else s.log.unshift(n+" unsold");
  s.log=s.log.slice(0,12);next(s,now);return true}
 return false}
function view(s,now){const teams={};for(const[u,t]of Object.entries(s.teams))teams[u]={team:t.team,cap:t.cap,budget:t.budget,pl:t.pl};
 return{phase:s.phase,teams,idx:s.idx,total:P.length,cur:s.phase==="live"?P[s.order[s.idx]]:null,high:s.high,by:s.by,skip:s.skip,end:s.end,log:s.log,now,base:BASE,buys:BUYS}}
module.exports=async(req,res)=>{
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({err:"POST only"});
 if(!U||!T)return res.status(500).json({err:"Database not connected (see README)"});
 try{const b=req.body||{},now=Date.now(),a=b.a;
  const auth=s=>s.teams[b.id]&&typeof b.token==="string"&&same(s.teams[b.id].token,b.token);
  const hostOk=()=>process.env.HOST_PIN&&same(b.pin||"",process.env.HOST_PIN);
  if(a==="state"){let s=await load();const c=JSON.parse(JSON.stringify(s));
   if(advance(c,now)){await locked(async x=>advance(x,Date.now())?undefined:false);s=await load()}
   return res.json({s:view(s,now)})}
  if(a==="join"){const team=clean(b.team),cap=clean(b.cap);if(!team||!cap)return res.json({err:"Enter team and captain name"});
   const out=await locked(async s=>{if(s.phase!=="lobby")return false;if(Object.keys(s.teams).length>=MAXTEAMS)return false;
    const id=crypto.randomBytes(4).toString("hex"),token=crypto.randomBytes(16).toString("hex");
    s.teams[id]={team,cap,budget:BUDGET,pl:[],token};return{id,token}});
   return res.json(out?out:{err:"Auction already started or full"})}
  if(a==="start"||a==="reset"){if(!hostOk())return res.json({err:"Wrong host PIN"});
   const out=await locked(async s=>{
    if(a==="reset"){for(const t of Object.values(s.teams)){t.budget=BUDGET;t.pl=[]}s.phase="lobby";s.log=[];return true}
    if(Object.keys(s.teams).length<2||s.phase!=="lobby")return false;
    const o=P.map((_,i)=>i);for(let i=o.length-1;i>0;i--){const j=crypto.randomInt(i+1);[o[i],o[j]]=[o[j],o[i]]}
    Object.assign(s,{phase:"live",order:o,idx:0,high:0,by:null,skip:[],end:now+FIRST,log:[]});return true});
   return res.json(out?{ok:1}:{err:"Need 2+ teams in the lobby"})}
  if(a==="bid"||a==="skip"){let err=null;
   await locked(async s=>{advance(s,Date.now());
    if(!auth(s)){err="Not a player";return}
    if(s.phase!=="live"||b.lot!==s.idx){err="That player is already done";return}
    const t=s.teams[b.id];
    if(a==="skip"){if(s.by!==b.id&&!s.skip.includes(b.id))s.skip.push(b.id);advance(s,Date.now());return}
    const m=Number(b.amt);
    if(!isFinite(m)||m!==r1(m)||m<BASE||m<=s.high||s.by===b.id||!open(t)||m>maxBid(t)){err="Invalid bid (your max is "+maxBid(t)+"M)";return}
    s.high=m;s.by=b.id;s.end=Date.now()+TURN;s.skip=s.skip.filter(x=>x!==b.id)});
   return res.json(err?{err}:{ok:1})}
  return res.status(400).json({err:"Bad request"})
 }catch(e){return res.status(500).json({err:"Server error, try again"})}};
