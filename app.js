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
const syncBadge = document.getElementById("syncBadge");

const sections = document.querySelectorAll("section");
document.querySelectorAll("nav button").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    sections.forEach(s => s.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "table") renderTable();
    if (btn.dataset.tab === "players") renderPlayers();
  };
});

logoutBtn.onclick = async () => { await signOut(auth); location.reload(); };

// Fixtures UI
const fixturesList = document.getElementById("fixturesList");
const addFixtureBtn = document.getElementById("addFixtureBtn");
const fixtureFormCard = document.getElementById("fixtureFormCard");
const fixtureFormTitle = document.getElementById("fixtureFormTitle");
const fixtureFormHint = document.getElementById("fixtureFormHint");
const saveFixtureBtn = document.getElementById("saveFixtureBtn");
const cancelFixtureBtn = document.getElementById("cancelFixtureBtn");
const fixDate = document.getElementById("fixDate");
const fixVenue = document.getElementById("fixVenue");
const fixHome = document.getElementById("fixHome");
const fixAway = document.getElementById("fixAway");

// Scoresheets UI
const fixtureSelect = document.getElementById("fixtureSelect");
const fixtureMeta = document.getElementById("fixtureMeta");
const lockBadge = document.getElementById("lockBadge");
const byeBadge = document.getElementById("byeBadge");
const homeSel = document.getElementById("homeTeam");
const awaySel = document.getElementById("awayTeam");
const framesDiv = document.getElementById("frames");
const saveSheetBtn = document.getElementById("saveSheet");
const confirmMatchBtn = document.getElementById("confirmMatch");

// Table + dashboard
const tableBody = document.getElementById("tableBody");
const topPerformerEl = document.getElementById("topPerformer");
const dashboardMeta = document.getElementById("dashboardMeta");

// Players
const playersBody = document.getElementById("playersBody");

// System
const resetTableBtn = document.getElementById("resetTable");
const resetSheetsBtn = document.getElementById("resetSheets");
const unlockFixtureSelect = document.getElementById("unlockFixtureSelect");
const unlockFixtureBtn = document.getElementById("unlockFixtureBtn");
const roleManagerList = document.getElementById("roleManagerList");

// Audit
const auditLogBox = document.getElementById("auditLog");

// ---- STATE ----
let currentUser = null;
let currentRole = "player";
let fixtures = {};           // fixtures/{id}
let users = {};              // users/{uid}
let selectedFixtureId = null;
let currentSheetConfirmed = false;
let fixtureEditId = null;

// ---- Helpers ----
const isAdmin = () => ["captain","co-captain","system-creator"].includes(currentRole);
const isSystem = () => currentRole === "system-creator";
const isCaptainLevel = () => ["captain","system-creator"].includes(currentRole);

function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function parseDateSafe(s){
  // expects YYYY-MM-DD, falls back to 0
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : 0;
}

function seedTeamSelect(selectEl, includeBye=true){
  const list = includeBye ? TEAMS : TEAMS.filter(t => t !== "BYE");
  selectEl.innerHTML = list.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join("");
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

async function markSaved(actionLabel){
  // for sync indicator + audit trail
  try {
    await set(ref(db, "meta/lastWrite"), { ts: Date.now(), by: currentUser?.uid || null, action: actionLabel || "" });
  } catch {}
}

// ---- SYNC STATUS (Cloud Back-up notice) ----
function setupSyncBadge(){
  onValue(ref(db, ".info/connected"), (snap) => {
    const online = !!snap.val();
    syncBadge.textContent = online ? "🟢 Online" : "🔴 Offline";
  });

  onValue(ref(db, "meta/lastWrite"), (snap) => {
    if(!snap.exists()) return;
    const v = snap.val();
    const when = new Date(v.ts).toLocaleString();
    const label = syncBadge.textContent.includes("Offline") ? "🔴 Offline" : "🟢 Online";
    syncBadge.textContent = `${label} · Last saved ${when}`;
  });
}

// ---- AUTH ----
onAuthStateChanged(auth, async (user) => {
  if(!user) return;
  currentUser = user;

  const uref = ref(db, `users/${user.uid}`);
  let usnap = await get(uref);
  if(!usnap.exists()){
    await set(uref, {
      email: user.email,
      name: user.email.split("@")[0],
      role: user.email === "thayessmith@rackcafeutd.com" ? "system-creator" : "player",
      stats: { framesWon:0, framesLost:0, matches:0, winPct:0 }
    });
    await markSaved("Create user profile");
    usnap = await get(uref);
  }

  const u = usnap.val();
  currentRole = u.role || "player";

  headerName.textContent = u.name || "user";
  headerRole.textContent = currentRole;

  setTimeout(() => {
    if (isAdmin()) adminTab.classList.remove("hidden");
    if (isSystem()) systemTab.classList.remove("hidden");
    if (isAdmin()) addFixtureBtn.classList.remove("hidden");
  }, 0);

  // seed UI
  seedTeamSelect(fixHome, true);
  seedTeamSelect(fixAway, true);
  seedTeamSelect(homeSel, true);
  seedTeamSelect(awaySel, true);
  homeSel.disabled = true;
  awaySel.disabled = true;
  buildFramesUI();

  setupSyncBadge();
  setupUsersListener();
  setupFixturesListener();
  setupAuditListener();

  renderTable();
  renderPlayers();
});

// ---- USERS ----
function setupUsersListener(){
  onValue(ref(db, "users"), (snap) => {
    users = snap.exists() ? snap.val() : {};
    renderPlayers();
    renderRoleManager();
  });
}

// ---- FIXTURES ----
addFixtureBtn.onclick = () => {
  if(!isAdmin()) return;
  fixtureEditId = null;
  fixtureFormTitle.textContent = "Add Fixture";
  fixtureFormHint.textContent = "Tip: use YYYY-MM-DD so sorting works properly.";
  fixDate.value = "";
  fixVenue.value = "";
  fixtureFormCard.classList.remove("hidden");
};

cancelFixtureBtn.onclick = () => {
  fixtureFormCard.classList.add("hidden");
  fixtureEditId = null;
};

saveFixtureBtn.onclick = async () => {
  try {
    if(!isAdmin()) return alert("Admins only");

    const date = fixDate.value.trim();
    const venue = fixVenue.value.trim();
    const home = fixHome.value;
    const away = fixAway.value;

    if(!date || !venue || !home || !away) return alert("Fill all fields");
    if(home === away) return alert("Home and Away must be different");

    const id = fixtureEditId || String(Date.now());
    const payload = { id, date, venue, home, away, updatedAt: Date.now() };
    if(!fixtureEditId) payload.createdAt = Date.now();

    await set(ref(db, `fixtures/${id}`), payload);
    await markSaved(fixtureEditId ? "Edit fixture" : "Add fixture");
    audit(`${fixtureEditId ? "Edit" : "Add"} fixture: ${home} vs ${away} (${date})`);

    fixtureFormCard.classList.add("hidden");
    fixtureEditId = null;
    alert("Saved ✅");
  } catch (err) {
    console.error("Save fixture failed:", err);
    alert("Save fixture failed:\n" + (err?.message || err));
  }
};

async function deleteFixture(id){
  if(!isAdmin()) return;
  if(!confirm("Delete this fixture (and its scoresheet/result)?")) return;

  await remove(ref(db, `fixtures/${id}`));
  await remove(ref(db, `scoresheets/${id}`));
  await remove(ref(db, `results/${id}`));
  await markSaved("Delete fixture");
  audit(`Delete fixture ${id}`);
}

function editFixture(id){
  if(!isAdmin()) return;
  const f = fixtures[id];
  if(!f) return;

  fixtureEditId = id;
  fixtureFormTitle.textContent = "Edit Fixture";
  fixtureFormHint.textContent = "Editing a fixture does not alter confirmed results already stored.";
  fixDate.value = f.date || "";
  fixVenue.value = f.venue || "";
  fixHome.value = f.home || "Rack Café Utd";
  fixAway.value = f.away || "Ashfield Massive";
  fixtureFormCard.classList.remove("hidden");
}

function setupFixturesListener(){
  onValue(ref(db, "fixtures"), (snap) => {
    fixtures = snap.exists() ? snap.val() : {};
    renderFixturesList();
    renderFixtureSelects();

    if(!selectedFixtureId){
      const first = Object.keys(fixtures).sort((a,b)=>{
        const fa = fixtures[a], fb = fixtures[b];
        return parseDateSafe(fa?.date) - parseDateSafe(fb?.date) || Number(a)-Number(b);
      })[0] || null;
      if(first) {
        selectedFixtureId = first;
        fixtureSelect.value = first;
        loadScoresheetForFixture(first);
      }
    } else {
      if(!fixtures[selectedFixtureId]) selectedFixtureId = null;
    }
  });
}

function fixtureIdsSorted(){
  return Object.keys(fixtures).sort((a,b)=>{
    const fa = fixtures[a], fb = fixtures[b];
    return parseDateSafe(fa?.date) - parseDateSafe(fb?.date) || Number(a)-Number(b);
  });
}

function renderFixturesList(){
  const ids = fixtureIdsSorted();
  if(ids.length === 0){
    fixturesList.innerHTML = `<div class="fixture"><div><strong>No fixtures yet</strong><br><small>Add one as Admin</small></div></div>`;
    return;
  }

  fixturesList.innerHTML = ids.map(id => {
    const f = fixtures[id];
    const bye = (f.home === "BYE" || f.away === "BYE");
    return `
      <div class="fixture">
        <div>
          <strong>${esc(f.home)} vs ${esc(f.away)} ${bye ? `<span class="badge" style="margin-left:8px">BYE</span>` : ""}</strong><br>
          <small>${esc(f.date)} · ${esc(f.venue)}</small>
        </div>
        <div class="right">
          <button class="secondary" onclick="window.__openSheet('${id}')">Scoresheet</button>
          ${isAdmin() ? `<button class="secondary" onclick="window.__editFix('${id}')">Edit</button>` : ``}
          ${isAdmin() ? `<button class="secondary danger" onclick="window.__delFix('${id}')">Delete</button>` : ``}
        </div>
      </div>
    `;
  }).join("");

  window.__delFix = deleteFixture;
  window.__editFix = editFixture;
  window.__openSheet = (id) => {
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
  const ids = fixtureIdsSorted();
  const opts = ids.map(id=>{
    const f = fixtures[id];
    return `<option value="${id}">${esc(f.date)} — ${esc(f.home)} vs ${esc(f.away)}</option>`;
  }).join("");

  fixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
  unlockFixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
}

// ---- SCORESHEETS per fixture ----
fixtureSelect.onchange = () => {
  const id = fixtureSelect.value;
  selectedFixtureId = id || null;
  if(id) loadScoresheetForFixture(id);
};

function isByeFixture(f) {
  return (f?.home === "BYE" || f?.away === "BYE");
}

function loadScoresheetForFixture(id){
  const f = fixtures[id];
  if(!f) return;

  fixtureMeta.textContent = `${f.date} · ${f.venue}`;
  homeSel.value = f.home;
  awaySel.value = f.away;

  const bye = isByeFixture(f);
  byeBadge.classList.toggle("hidden", !bye);

  // If BYE fixture: lock editing and allow system/admin to confirm quickly
  if(bye){
    framesDiv.querySelectorAll("select").forEach(s => { s.value=""; s.disabled = true; });
    saveSheetBtn.disabled = true;
    confirmMatchBtn.disabled = !isAdmin();
    setSheetLocked(false);
    lockBadge.classList.add("hidden");
  }

  onValue(ref(db, `scoresheets/${id}`), (snap) => {
    const sheet = snap.exists() ? snap.val() : null;

    // reset UI frames first
    const selects = [...framesDiv.querySelectorAll("select")];
    selects.forEach(s => { if(!bye) s.value = ""; });

    if(!bye && sheet && Array.isArray(sheet.frames)){
      sheet.frames.forEach((v,i) => { if(selects[i]) selects[i].value = v || ""; });
    }

    if(!bye) setSheetLocked(!!(sheet && sheet.confirmed));
    if(bye && sheet?.confirmed) {
      lockBadge.classList.remove("hidden");
      lockBadge.textContent = "Locked";
      confirmMatchBtn.disabled = true;
    }
  });
}

saveSheetBtn.onclick = async () => {
  if(!isAdmin()) return alert("Admins only");
  if(!selectedFixtureId) return alert("Select a fixture first");

  const f = fixtures[selectedFixtureId];
  if(isByeFixture(f)) return alert("BYE fixtures don’t need a scoresheet.");

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

  await markSaved("Save scoresheet");
  audit(`Save scoresheet fixture ${selectedFixtureId}`);
  alert("Saved");
};

confirmMatchBtn.onclick = async () => {
  if(!isAdmin()) return;
  if(!selectedFixtureId) return alert("Select a fixture first");

  const f = fixtures[selectedFixtureId];
  if(!f) return alert("Fixture missing");

  // BYE auto-confirm:
  if(isByeFixture(f)){
    const rackIsHome = (f.home === "Rack Café Utd");
    const rackIsAway = (f.away === "Rack Café Utd");
    // If Rack is playing BYE, give Rack 10-0; otherwise BYE vs BYE or non-rack is 0-0.
    let homeWins = 0, awayWins = 0;
    if(rackIsHome && f.away === "BYE") { homeWins = 10; awayWins = 0; }
    else if(rackIsAway && f.home === "BYE") { homeWins = 0; awayWins = 10; }

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

    await set(ref
