import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, remove, onValue
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ---- CONSTANTS ----
const TEAMS = [
  "Rack Café Utd","Ashfield Massive","Carlton Club","Monkey Club",
  "Longwood BC Wednesday","BYE","Marsh Lib","Junction (Marsh) 'A'",
  "Milnsbridge Lib 'D'","Cavalry Arms Jaegars"
];
const FRAMES = 10;

// ---- UI ----
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");

const sections = document.querySelectorAll("section");
document.querySelectorAll("nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    sections.forEach(s => s.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "table") renderTable();
  };
});

logoutBtn.onclick = async () => { await signOut(auth); location.reload(); };

// Fixtures UI
const fixturesList = document.getElementById("fixturesList");
const addFixtureBtn = document.getElementById("addFixtureBtn");
const addFixtureForm = document.getElementById("addFixtureForm");
const saveFixtureBtn = document.getElementById("saveFixtureBtn");
const cancelFixtureBtn = document.getElementById("cancelFixtureBtn");
const fixDate = document.getElementById("fixDate");
const fixVenue = document.getElementById("fixVenue");
const fixHome = document.getElementById("fixHome");
const fixAway = document.getElementById("fixAway");

// Scoresheets UI
const fixtureSelect = document.getElementById("fixtureSelect");
const fixtureMeta = document.getElementById("fixtureMeta");
const homeSel = document.getElementById("homeTeam");
const awaySel = document.getElementById("awayTeam");
const framesDiv = document.getElementById("frames");
const saveSheetBtn = document.getElementById("saveSheet");
const confirmMatchBtn = document.getElementById("confirmMatch");
const lockBadge = document.getElementById("lockBadge");

// System UI
const resetTableBtn = document.getElementById("resetTable");
const resetSheetsBtn = document.getElementById("resetSheets");
const unlockFixtureSelect = document.getElementById("unlockFixtureSelect");
const unlockFixtureBtn = document.getElementById("unlockFixtureBtn");

// ---- STATE ----
let currentUser = null;
let currentRole = "player";
let fixtures = {}; // {fixtureId: {...}}
let selectedFixtureId = null;
let currentSheetConfirmed = false;

// ---- Helpers ----
const isAdmin = () => ["captain","co-captain","system-creator"].includes(currentRole);
const isSystem = () => currentRole === "system-creator";

function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function seedTeamSelect(selectEl){
  selectEl.innerHTML = TEAMS.map(t => `<option value="${escapeHtml(t)}">${t}</option>`).join("");
}

function buildFramesUI(){
  framesDiv.innerHTML = "";
  for(let i=0;i<FRAMES;i++){
    framesDiv.innerHTML += `
      <select data-i="${i}">
        <option value="">Frame ${i+1}</option>
        <option value="H">Home win</option>
        <option value="A">Away win</option>
      </select>
    `;
  }
}

function setSheetLocked(locked){
  currentSheetConfirmed = locked;
  lockBadge.classList.toggle("hidden", !locked);

  const canEdit = isAdmin() && (!locked || isSystem());
  framesDiv.querySelectorAll("select").forEach(s => s.disabled = !canEdit);
  saveSheetBtn.disabled = !canEdit;
  confirmMatchBtn.disabled = !canEdit || locked;
}

// ---- AUTH ----
onAuthStateChanged(auth, async (user) => {
  if(!user) return;
  currentUser = user;

  // user profile
  const uref = ref(db, `users/${user.uid}`);
  let usnap = await get(uref);
  if(!usnap.exists()){
    await set(uref, {
      email: user.email,
      name: user.email.split("@")[0],
      role: user.email === "thayessmith@rackcafeutd.com" ? "system-creator" : "player"
    });
    usnap = await get(uref);
  }

  const u = usnap.val();
  currentRole = u.role || "player";
  headerName.textContent = u.name || "user";
  headerRole.textContent = currentRole;

  // role gates
  setTimeout(() => {
    if (isAdmin()) adminTab.classList.remove("hidden");
    if (isSystem()) systemTab.classList.remove("hidden");
    if (isAdmin()) addFixtureBtn.classList.remove("hidden");
  }, 0);

  // seed UI
  seedTeamSelect(fixHome);
  seedTeamSelect(fixAway);
  buildFramesUI();

  // disable home/away selectors in scoresheet (fixture defines them)
  seedTeamSelect(homeSel);
  seedTeamSelect(awaySel);
  homeSel.disabled = true;
  awaySel.disabled = true;

  // listeners
  setupFixturesListener();
  setupAuditListener();
  renderTable();
});

// ---- Fixtures ----
addFixtureBtn.onclick = () => {
  if(!isAdmin()) return;
  addFixtureForm.classList.remove("hidden");
};

cancelFixtureBtn.onclick = () => {
  addFixtureForm.classList.add("hidden");
  fixDate.value = "";
  fixVenue.value = "";
};

saveFixtureBtn.onclick = async () => {
  if(!isAdmin()) return alert("Admins only");

  const date = fixDate.value.trim();
  const venue = fixVenue.value.trim();
  const home = fixHome.value;
  const away = fixAway.value;

  if(!date || !venue || !home || !away) return alert("Fill all fields");
  if(home === away) return alert("Home and Away must be different");

  const id = String(Date.now());
  await set(ref(db, `fixtures/${id}`), { id, date, venue, home, away, createdAt: Date.now() });
  audit(`Add fixture ${home} vs ${away} (${date})`);

  addFixtureForm.classList.add("hidden");
  fixDate.value = "";
  fixVenue.value = "";
};

async function deleteFixture(id){
  if(!isAdmin()) return;
  if(!confirm("Delete this fixture (and its scoresheet/result)?")) return;

  await remove(ref(db, `fixtures/${id}`));
  await remove(ref(db, `scoresheets/${id}`));
  await remove(ref(db, `results/${id}`));
  audit(`Delete fixture ${id}`);
}

function setupFixturesListener(){
  onValue(ref(db, "fixtures"), (snap) => {
    fixtures = snap.exists() ? snap.val() : {};
    renderFixturesList();
    renderFixtureSelects();
    if(!selectedFixtureId){
      const first = Object.keys(fixtures).sort()[0] || null;
      if(first) {
        selectedFixtureId = first;
        fixtureSelect.value = first;
        loadScoresheetForFixture(first);
      }
    } else {
      // keep current selection if still exists
      if(!fixtures[selectedFixtureId]){
        selectedFixtureId = null;
      }
    }
  });
}

function renderFixturesList(){
  const ids = Object.keys(fixtures).sort((a,b)=>Number(a)-Number(b));
  if(ids.length === 0){
    fixturesList.innerHTML = `<div class="fixture"><div><strong>No fixtures yet</strong><br><small>Add one as Admin</small></div></div>`;
    return;
  }

  fixturesList.innerHTML = ids.map(id => {
    const f = fixtures[id];
    return `
      <div class="fixture">
        <div>
          <strong>${escapeHtml(f.home)} vs ${escapeHtml(f.away)}</strong><br>
          <small>${escapeHtml(f.date)} · ${escapeHtml(f.venue)}</small>
        </div>
        <div class="right">
          <button class="secondary" onclick="window.__openSheet('${id}')">Scoresheet</button>
          ${isAdmin() ? `<button class="secondary danger" onclick="window.__delFix('${id}')">Delete</button>` : ``}
        </div>
      </div>
    `;
  }).join("");

  // wire window handlers
  window.__delFix = deleteFixture;
  window.__openSheet = (id) => {
    // switch to scoresheets tab
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    document.querySelector(`nav button[data-tab="scoresheets"]`).classList.add("active");
    sections.forEach(s => s.classList.add("hidden"));
    document.getElementById("scoresheets").classList.remove("hidden");

    selectedFixtureId = id;
    fixtureSelect.value = id;
    loadScoresheetForFixture(id);
  };
}

function renderFixtureSelects(){
  const ids = Object.keys(fixtures).sort((a,b)=>Number(a)-Number(b));
  const opts = ids.map(id=>{
    const f = fixtures[id];
    return `<option value="${id}">${escapeHtml(f.date)} — ${escapeHtml(f.home)} vs ${escapeHtml(f.away)}</option>`;
  }).join("");

  fixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
  unlockFixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
}

// ---- Scoresheets per fixture ----
fixtureSelect.onchange = () => {
  const id = fixtureSelect.value;
  selectedFixtureId = id || null;
  if(id) loadScoresheetForFixture(id);
};

function loadScoresheetForFixture(id){
  const f = fixtures[id];
  if(!f) return;

  fixtureMeta.textContent = `${f.date} · ${f.venue}`;
  homeSel.value = f.home;
  awaySel.value = f.away;

  // live listener for THIS fixture sheet
  onValue(ref(db, `scoresheets/${id}`), (snap) => {
    const sheet = snap.exists() ? snap.val() : null;

    // reset UI frames first
    const selects = [...framesDiv.querySelectorAll("select")];
    selects.forEach(s => s.value = "");

    if(sheet && Array.isArray(sheet.frames)){
      sheet.frames.forEach((v,i) => { if(selects[i]) selects[i].value = v || ""; });
    }

    setSheetLocked(!!(sheet && sheet.confirmed));
  });
}

saveSheetBtn.onclick = async () => {
  if(!isAdmin()) return alert("Admins only");
  if(!selectedFixtureId) return alert("Select a fixture first");

  if(currentSheetConfirmed && !isSystem()){
    return alert("This match is locked. Only System Creator can unlock.");
  }

  const frames = [...framesDiv.querySelectorAll("select")].map(s => s.value);
  await set(ref(db, `scoresheets/${selectedFixtureId}`), {
    fixtureId: selectedFixtureId,
    frames,
    confirmed: false,
    updatedAt: Date.now(),
    updatedBy: currentUser.uid
  });

  audit(`Save scoresheet fixture ${selectedFixtureId}`);
  alert("Saved");
};

confirmMatchBtn.onclick = async () => {
  if(!isAdmin()) return;
  if(!selectedFixtureId) return alert("Select a fixture first");

  const f = fixtures[selectedFixtureId];
  if(!f) return alert("Fixture missing");

  const ssnap = await get(ref(db, `scoresheets/${selectedFixtureId}`));
  if(!ssnap.exists()) return alert("Save the scoresheet first");

  const sheet = ssnap.val();
  if(sheet.confirmed) return alert("Already confirmed (locked)");

  const frames = Array.isArray(sheet.frames) ? sheet.frames : [];
  const homeWins = frames.filter(x => x === "H").length;
  const awayWins = FRAMES - homeWins;

  // write result once at results/{fixtureId}
  await set(ref(db, `results/${selectedFixtureId}`), {
    fixtureId: selectedFixtureId,
    home: f.home,
    away: f.away,
    homeWins,
    awayWins,
    confirmed: true,
    confirmedAt: Date.now(),
    confirmedBy: currentUser.uid
  });

  // lock sheet
  await update(ref(db, `scoresheets/${selectedFixtureId}`), { confirmed: true });

  audit(`Confirm match fixture ${selectedFixtureId} (${f.home} ${homeWins}-${awayWins} ${f.away})`);
  renderTable();
  alert("Confirmed & locked");
};

// ---- League Table from results/{fixtureId} ----
function baseTable(){
  return TEAMS.map(t=>({team:t,P:0,FF:0,FA:0,PTS:0}));
}

async function renderTable(){
  const body = document.getElementById("tableBody");
  if(!body) return;

  const rows = baseTable();
  const idx = Object.fromEntries(rows.map((r,i)=>[r.team,i]));

  const rsnap = await get(ref(db,"results"));
  if(rsnap.exists()){
    Object.values(rsnap.val()).forEach(m=>{
      if(!m || !m.confirmed) return;
      const h = rows[idx[m.home]];
      const a = rows[idx[m.away]];
      if(!h || !a) return;

      h.P++; a.P++;
      h.FF += m.homeWins; h.FA += m.awayWins; h.PTS += m.homeWins;
      a.FF += m.awayWins; a.FA += m.homeWins; a.PTS += m.awayWins;
    });
  }

  rows.sort((x,y)=>y.PTS-x.PTS || (y.FF-y.FA)-(x.FF-x.FA) || y.FF-x.FF);

  body.innerHTML = rows.map((r,i)=>`
    <tr><td>${i+1}</td><td>${escapeHtml(r.team)}</td><td>${r.P}</td><td>${r.FF}</td><td>${r.FA}</td><td>${r.PTS}</td></tr>
  `).join("");

  const rack = rows.find(r=>r.team==="Rack Café Utd");
  const top = document.getElementById("topPerformer");
  if(top){
    top.textContent = rack && rack.P > 0
      ? `Rack Café Utd: ${rack.PTS} frame points from ${rack.P} match(es).`
      : "No one yet — no games have been played.";
  }
}

// ---- System Creator tools ----
resetTableBtn.onclick = async () => {
  if(!isSystem()) return;
  if(!confirm("Reset ALL results? (League table will clear)")) return;
  await remove(ref(db, "results"));
  audit("Reset league table (results cleared)");
  renderTable();
};

resetSheetsBtn.onclick = async () => {
  if(!isSystem()) return;
  if(!confirm("Reset ALL scoresheets? (Unconfirms everything)")) return;
  await remove(ref(db, "scoresheets"));
  audit("Reset all scoresheets");
};

unlockFixtureBtn.onclick = async () => {
  if(!isSystem()) return;
  const id = unlockFixtureSelect.value;
  if(!id) return alert("Select a fixture");
  await update(ref(db, `scoresheets/${id}`), { confirmed:false });
  await remove(ref(db, `results/${id}`));
  audit(`Unlock fixture ${id} (result removed + sheet unlocked)`);
  renderTable();
};

// ---- Audit ----
function audit(action){
  if(!currentUser) return;
  push(ref(db,"audit"), { by: currentUser.uid, action, ts: Date.now() });
}

function setupAuditListener(){
  const box = document.getElementById("auditLog");
  if(!box) return;

  onValue(ref(db,"audit"), (snap)=>{
    if(!snap.exists()){
      box.innerHTML = `<div class="card"><strong>Audit Log</strong><br><small>No entries yet</small></div>`;
      return;
    }
    const list = Object.values(snap.val()).sort((a,b)=>b.ts-a.ts).slice(0,12);
    box.innerHTML = `
      <div class="card">
        <strong>Audit Log (latest)</strong>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
          ${list.map(e=>`
            <div style="border:1px solid #1e293b;border-radius:10px;padding:10px">
              <div><strong>${escapeHtml(e.action)}</strong></div>
              <small>${new Date(e.ts).toLocaleString()}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });
}
