const $=s=>document.querySelector(s),r1=x=>Math.round(x*10)/10;
let S=null,last="",off=0,cv="",pin=sessionStorage.getItem("pin")||"",me=JSON.parse(localStorage.getItem("me")||"null");
function h(t,c,x){const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
async function api(a,d,quiet){try{const x=await fetch("/api/auction",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({a,...d,id:me&&me.id,token:me&&me.token,pin})});const j=await x.json();
 if(j.err){if(!quiet)alert(j.err);return {err:j.err}}return j}catch(e){if(!quiet)alert("Network problem");return null}}
async function poll(){const j=await api("state",{},true);
 if(!j){if(!S)$("#app").innerHTML='<h1>🏏 Fantasy Cricket Auction</h1><div class="card"><h2>⚠️ Connection Error</h2><p class="m">Could not reach the server.</p></div>';return}
 if(j.err){if(!S)$("#app").innerHTML='<h1>🏏 Fantasy Cricket Auction</h1><div class="card"><h2>⚠️ Database Not Connected</h2><p class="m">'+j.err+'</p><p class="m" style="margin-top:8px">To fix this: Go to your Vercel Project dashboard &gt; <b>Storage</b> &gt; connect <b>Upstash Redis</b>.</p></div>';return}
 S=j.s;off=S.now-Date.now();
 if(me&&!S.teams[me.id]){me=null;localStorage.removeItem("me")}
 const k=JSON.stringify({...S,now:0});if(k!==last){last=k;render()}}
setInterval(poll,2000);poll();
setInterval(()=>{const e=$("#tm");if(e&&S)e.textContent=Math.max(0,Math.ceil((S.end-(Date.now()+off))/1000))+"s"},250);
const act=async(a,d)=>{await api(a,d);poll()};
const maxBid=t=>r1(t.budget-(S.buys-1-t.pl.length)*S.base),open=t=>t.pl.length<S.buys&&maxBid(t)>=S.base;
function hostBox(a,btns){const d=h("div","card"),i=h("input");i.type="password";i.placeholder="Host PIN (host only)";i.value=pin;i.oninput=()=>{pin=i.value;sessionStorage.setItem("pin",pin)};d.append(i,...btns);a.append(d)}
function render(){const a=$("#app");a.replaceChildren(h("h1",0,"🏏 Fantasy Cricket Auction"));
 if(S.phase==="lobby")lobby(a);else if(S.phase==="live")live(a);else done(a)}
function lobby(a){const c=h("div","card");a.append(c);
 if(!me){c.append(h("h2",0,"Join the auction"));const t=h("input"),p=h("input"),b=h("button",0,"Join");
  t.placeholder="Team name";p.placeholder="Your name (captain)";t.maxLength=p.maxLength=24;
  b.onclick=async()=>{const j=await api("join",{team:t.value,cap:p.value});if(j&&!j.err){me=j;localStorage.setItem("me",JSON.stringify(j));poll()}};c.append(t,p,b)}
 else c.append(h("p","m","You are in. Waiting for the host to start."));
 const l=h("div","card"),ids=Object.keys(S.teams);l.append(h("h2",0,"Teams joined ("+ids.length+")"));
 ids.forEach(u=>l.append(h("div",0,S.teams[u].team+" — captain "+S.teams[u].cap+(me&&u===me.id?" (you)":""))));
 l.append(h("p","m",S.total+" players · 100M each · squad of "+(S.buys+1)+" = captain + "+S.buys+" bought"));a.append(l);
 const b=h("button",0,"Start auction");b.onclick=()=>act("start",{});hostBox(a,[b])}
function live(a){const t=me&&S.teams[me.id],c=h("div","card");a.append(c);
 c.append(h("div","m","Player "+(S.idx+1)+" of "+S.total+" · base "+S.base+"M"),h("div","big",S.cur));
 const hb=h("div","row");hb.append(h("div","big",S.by?S.high+"M":"No bids"));
 if(S.by)hb.append(h("span","tag","leader: "+S.teams[S.by].team));const tm=h("div","tm");tm.id="tm";hb.append(tm);c.append(hb);
 if(!t)c.append(h("p","m","Spectating."));
 else if(!open(t))c.append(h("p","m","Your squad is full or out of budget."));
 else if(S.skip.includes(me.id))c.append(h("p","m","You skipped this player."));
 else{const min=r1(Math.max(S.base,S.high+S.base)),r=h("div","row"),lead=S.by===me.id;
  [...new Set([min,r1(S.high+1),r1(S.high+2)])].filter(v=>v>=min).forEach(v=>{const b=h("button",0,"Bid "+v+"M");b.disabled=lead||v>maxBid(t);b.onclick=()=>act("bid",{amt:v,lot:S.idx});r.append(b)});
  const i=h("input");i.type="number";i.step=".1";i.placeholder="Custom";i.value=cv;i.style.cssText="width:110px;margin:0";i.oninput=()=>cv=i.value;
  const g=h("button","g","Bid");g.disabled=lead;g.onclick=()=>act("bid",{amt:r1(parseFloat(i.value)),lot:S.idx});
  const k=h("button","s","Skip");k.disabled=lead;k.onclick=()=>act("skip",{lot:S.idx});r.append(i,g,k);c.append(r);
  c.append(h("p","m",lead?"You are the highest bidder.":"Your max bid: "+maxBid(t)+"M"))}
 const l=h("div","card sc"),tb=h("table");tb.innerHTML="<tr><th>Team</th><th>Bought</th><th>Budget</th><th></th></tr>";
 Object.keys(S.teams).forEach(u=>{const x=S.teams[u],r=tb.insertRow();[x.team+" ("+x.cap+")",x.pl.length+"/"+S.buys,x.budget+"M",S.by===u?"👑":S.skip.includes(u)?"skip":""].forEach(v=>r.insertCell().textContent=v)});
 l.append(tb);a.append(l);const g=h("div","card");g.append(h("h2",0,"Recent"));S.log.slice(0,8).forEach(x=>g.append(h("div","m",x)));a.append(g);
 const b=h("button","g","Reset auction");b.onclick=()=>confirm("Reset everything?")&&act("reset",{});hostBox(a,[b])}
function done(a){a.append(h("div","card","Auction finished! Final squads:"));
 Object.values(S.teams).forEach(x=>{const c=h("div","card");c.append(h("h2",0,x.team+" — captain "+x.cap));
  c.append(h("div","m","Remaining budget: "+x.budget+"M · bought: "+x.pl.length));x.pl.forEach(p=>c.append(h("div",0,p.n+" — "+p.p+"M")));a.append(c)});
 const b=h("button","g","New auction");b.onclick=()=>act("reset",{});hostBox(a,[b])}
