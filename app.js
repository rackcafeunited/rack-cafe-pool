import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ----- CONSTANTS -----
const TEAMS = [
  "Rack Café Utd","Ashfield Massive","Carlton Club","Monkey Club",
  "Longwood BC Wednesday","BYE","Marsh Lib","Junction (Marsh) 'A'",
  "Milnsbridge Lib 'D'","Cavalry Arms Jaegars"
];
const FRAMES = 10;

// ----- UI -----
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");

const sections = document.querySelectorAll("section");
document.querySelectorAll("nav button").forEach(btn=>{
  btn.onclick=()=>{
    document.querySelectorAll("nav button").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    sections.forEach(s=>s.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
    if(btn.dataset.tab==="table") renderTable();
  };
});

logoutBtn.onclick=async()=>{ await signOut(auth); location.reload(); };

// ----- AUTH -----
let currentUser=null, currentRole=null;
onAuthStateChanged(auth, async user=>{
  if(!user) return;
  currentUser=user;

  const uref=ref(db,`users/${user.uid}`);
  let snap=await get(uref);
  if(!snap.exists()){
    await set(uref,{
      email:user.email,
      name:user.email.split("@")[0],
      role: user.email==="thayessmith@rackcafeutd.com" ? "system-creator" : "player"
    });
    snap=await get(uref);
  }
  const data=snap.val();
  currentRole=data.role;

  headerName.textContent=data.name;
  headerRole.textContent=data.role;

  // role gates
  setTimeout(()=>{
    if(["captain","co-captain","system-creator"].includes(currentRole)) adminTab.classList.remove("hidden");
    if(currentRole==="system-creator") systemTab.classList.remove("hidden");
  },0);

  seedSelectors();
  renderTable();
});

// ----- LEAGUE TABLE -----
function baseTable(){
  return TEAMS.map(t=>({team:t,P:0,FF:0,FA:0,PTS:0}));
}

async function renderTable(){
  const body=document.getElementById("tableBody");
  const rows=baseTable();
  const idx=Object.fromEntries(rows.map((r,i)=>[r.team,i]));

  const results=await get(ref(db,"results"));
  if(results.exists()){
    Object.values(results.val()).forEach(m=>{
      if(!m.confirmed) return;
      const h=rows[idx[m.home]], a=rows[idx[m.away]];
      h.P++; a.P++;
      h.FF+=m.homeWins; h.FA+=m.awayWins; h.PTS+=m.homeWins;
      a.FF+=m.awayWins; a.FA+=m.homeWins; a.PTS+=m.awayWins;
    });
  }

  rows.sort((x,y)=>y.PTS-x.PTS || (y.FF-y.FA)-(x.FF-x.FA));
  body.innerHTML=rows.map((r,i)=>`
    <tr><td>${i+1}</td><td>${r.team}</td><td>${r.P}</td><td>${r.FF}</td><td>${r.FA}</td><td>${r.PTS}</td></tr>
  `).join("");

  const rack=rows.find(r=>r.team==="Rack Café Utd");
  document.getElementById("topPerformer").textContent =
    rack && rack.P>0 ? "Season in progress" : "No one yet — no games have been played.";
}

// ----- SCORESHEETS -----
const homeSel=document.getElementById("homeTeam");
const awaySel=document.getElementById("awayTeam");
const framesDiv=document.getElementById("frames");
const saveBtn=document.getElementById("saveSheet");
const confirmBtn=document.getElementById("confirmMatch");
const lockBadge=document.getElementById("lockBadge");

let currentSheet=null;

function seedSelectors(){
  homeSel.innerHTML=awaySel.innerHTML=TEAMS.map(t=>`<option>${t}</option>`).join("");
  framesDiv.innerHTML="";
  for(let i=0;i<FRAMES;i++){
    framesDiv.innerHTML+=`
      <select data-i="${i}">
        <option value="">Frame ${i+1}</option>
        <option value="H">Home win</option>
        <option value="A">Away win</option>
      </select>`;
  }
}

saveBtn.onclick=async()=>{
  if(!["captain","co-captain","system-creator"].includes(currentRole)) return alert("Admins only");
  const frames=[...framesDiv.querySelectorAll("select")].map(s=>s.value);
  currentSheet={home:homeSel.value,away:awaySel.value,frames,confirmed:false};
  await set(ref(db,"currentSheet"),currentSheet);
  audit("Save scoresheet");
  alert("Saved");
};

confirmBtn.onclick=async()=>{
  if(!["captain","co-captain","system-creator"].includes(currentRole)) return;
  const snap=await get(ref(db,"currentSheet"));
  if(!snap.exists()) return alert("Save first");
  const s=snap.val();
  const homeWins=s.frames.filter(x=>x==="H").length;
  const awayWins=FRAMES-homeWins;

  await push(ref(db,"results"),{
    home:s.home, away:s.away,
    homeWins, awayWins,
    confirmed:true
  });
  await update(ref(db,"currentSheet"),{confirmed:true});
  lockBadge.classList.remove("hidden");
  audit("Confirm match");
  renderTable();
};

document.getElementById("unlockMatch").onclick=async()=>{
  if(currentRole!=="system-creator") return;
  await update(ref(db,"currentSheet"),{confirmed:false});
  lockBadge.classList.add("hidden");
  audit("Unlock match");
};

document.getElementById("resetTable").onclick=async()=>{
  if(currentRole!=="system-creator") return;
  await set(ref(db,"results"),null);
  audit("Reset league table");
  renderTable();
};

// ----- AUDIT -----
function audit(action){
  push(ref(db,"audit"),{
    by:currentUser.uid,
    action,
    ts:Date.now()
  });
}
