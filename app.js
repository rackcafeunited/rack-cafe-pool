import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove, onValue } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Teams list
const TEAMS = [
  "Rack Café Utd",
  "Ashfield Massive",
  "Carlton Club",
  "Monkey Club",
  "Longwood BC Wednesday",
  "BYE",
  "Marsh Lib",
  "Junction (Marsh) 'A'",
  "Milnsbridge Lib 'D'",
  "Cavalry Arms Jaegars"
];

const FRAMES = 10;

// UI
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");

const syncPill = document.getElementById("syncPill");
const syncDot = document.getElementById("syncDot");
const syncText = document.getElementById("syncText");

const statMatches = document.getElementById("statMatches");
const statPoints = document.getElementById("statPoints");
const topPerformer = document.getElementById("topPerformer");

const fixturesList = document.getElementById("fixturesList");
const addFixtureBtn = document.getElementById("addFixtureBtn");
const fixtureForm = document.getElementById("fixtureForm");
const fixtureFormTitle = document.getElementById("fixtureFormTitle");
const fixtureFormHint = document.getElementById("fixtureFormHint");
const saveFixtureBtn = document.getElementById("saveFixtureBtn");
const cancelFixtureBtn = document.getElementById("cancelFixtureBtn");
const fixDate = document.getElementById("fixDate");
const fixVenue = document.getElementById("fixVenue");
const fixHome = document.getElementById("fixHome");
const fixAway = document.getElementById("fixAway");

const fixtureSelect = document.getElementById("fixtureSelect");
const fixtureMeta = document.getElementById("fixtureMeta");
const lockBadge = document.getElementById("lockBadge");
const homeTeam = document.getElementById("homeTeam");
const awayTeam = document.getElementById("awayTeam");
const framesDiv = document.getElementById("frames");
const saveSheetBtn = document.getElementById("saveSheet");
const confirmMatchBtn = document.getElementById("confirmMatch");

const tableBody = document.getElementById("tableBody");

const playersList = document.getElementById("playersList");

const resetTableBtn = document.getElementById("resetTable");
const resetSheetsBtn = document.getElementById("resetSheets");
const unlockFixtureSelect = document.getElementById("unlockFixtureSelect");
const unlockFixtureBtn = document.getElementById("unlockFixtureBtn");
const auditLog = document.getElementById("auditLog");

// Nav
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

logoutBtn.onclick = async () => {
  await signOut(auth);
  location.reload();
};

// State
let currentUser = null;
let currentRole = "player";
let fixtures = {};
let selectedFixtureId = null;
let selectedSheetConfirmed = false;
let editingFixtureId = null;
let usersCache = {}; // uid -> {name,role,email}

// Helpers
const isAdmin = () => ["captain", "co-captain", "system-creator"].includes(currentRole);
const isSystem = () => currentRole === "system-creator";

function escapeHtml(s){
  return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function seedTeams(selectEl){
  selectEl.innerHTML = TEAMS.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
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

function setSync(status, detail=""){
  // status: offline | saving | synced | error
  syncPill.className = "badge";
  if(status === "offline"){
    syncPill.classList.add("warn");
    syncDot.textContent = "●";
    syncText.textContent = "Offline";
  } else if(status === "saving"){
    syncPill.classList.add("warn");
    syncDot.textContent = "●";
    syncText.textContent = "Saving…";
  } else if(status === "synced"){
    syncPill.classList.add("ok");
    syncDot.textContent = "●";
    syncText.textContent = detail ? `Synced · ${detail}` : "Synced";
  } else {
    syncPill.classList.add("danger");
    syncDot.textContent = "●";
    syncText.textContent = "Error";
  }
}

async function writeWithSync(promise){
  setSync("saving");
  try{
    await promise;
    await set(ref(db, `meta/lastWrite`), { ts: Date.now(), by: currentUser?.uid || null });
    setSync("synced", new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) );
  } catch(e){
    console.error(e);
    setSync("error");
    throw e;
  }
}

function setSheetLocked(locked){
  selectedSheetConfirmed = locked;
  lockBadge.classList.toggle("hidden", !locked);

  const canEdit = isAdmin() && (!locked || isSystem());
  framesDiv.querySelectorAll("select").forEach(s => s.disabled = !canEdit);
  saveSheetBtn.disabled = !canEdit;
  confirmMatchBtn.disabled = !canEdit || locked;
}

function audit(action){
  if(!currentUser) return;
  push(ref(db, "audit"), { by: currentUser.uid, action, ts: Date.now() });
}

// Auth
onAuthStateChanged(auth, async (user) => {
  if(!user) return;
  currentUser = user;

  // profile
  const uref = ref(db, `users/${user.uid}`);
  let usnap = await get(uref);
  if(!usnap.exists()){
    await set(uref, {
      email: user.email,
      name: (user.email || "user").split("@")[0],
      role: user.email === "thayessmith@rackcafeutd.com" ? "system-creator" : "player"
    });
    usnap = await get(uref);
  }
  const u = usnap.val();
  currentRole = u.role || "player";
  headerName.textContent = u.name || "user";
  headerRole.textContent = currentRole;

  if(isAdmin()){
    adminTab.classList.remove("hidden");
    addFixtureBtn.classList.remove("hidden");
  }
  if(isSystem()) systemTab.classList.remove("hidden");

  seedTeams(fixHome);
  seedTeams(fixAway);
  seedTeams(homeTeam);
  seedTeams(awayTeam);
  homeTeam.disabled = true;
  awayTeam.disabled = true;
  buildFramesUI();

  setupConnectionListeners();
  setupUsersListener();
  setupFixturesListener();
  setupAuditListener();

  renderTable();
});

function setupConnectionListeners(){
  // .info/connected
  onValue(ref(db, ".info/connected"), (snap) => {
    const connected = !!snap.val();
    if(!connected) setSync("offline");
  });

  onValue(ref(db, "meta/lastWrite"), (snap) => {
    if(!snap.exists()) return;
    const ts = snap.val().ts;
    setSync("synced", new Date(ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) );
  });
}

// Users list (players appear after first login)
function setupUsersListener(){
  onValue(ref(db, "users"), (snap) => {
    usersCache = snap.exists() ? snap.val() : {};
    // refresh Players tab if open
    const active = document.querySelector("nav button.active")?.dataset?.tab;
    if(active === "players") renderPlayers();
  });
}

function renderPlayers(){
  const users = Object.entries(usersCache).map(([uid, data]) => ({ uid, ...data }));
  if(users.length === 0){
    playersList.innerHTML = `<div class="card"><strong>No players yet</strong><br><span class="muted">Players appear after first login.</span></div>`;
    return;
  }

  // Basic stats placeholder (Stage 5A will expand to per-frame player attribution later)
  playersList.innerHTML = users
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(u => `
      <div class="fixture">
        <div>
          <strong>${escapeHtml(u.name || "player")}</strong><br>
          <small>${escapeHtml(u.email || "")} · role: ${escapeHtml(u.role || "player")}</small>
        </div>
        <div class="right">
          <span class="pill">UID: ${escapeHtml(u.uid.slice(0,6))}…</span>
        </div>
      </div>
    `).join("");
}

// Fixtures
addFixtureBtn.onclick = () => {
  if(!isAdmin()) return;
  editingFixtureId = null;
  fixtureFormTitle.textContent = "Add Fixture";
  fixtureFormHint.textContent = "";
  fixDate.value = "";
  fixVenue.value = "";
  fixtureForm.classList.remove("hidden");
};

cancelFixtureBtn.onclick = () => {
  fixtureForm.classList.add("hidden");
  editingFixtureId = null;
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

    const id = editingFixtureId || String(Date.now());

    await writeWithSync(set(ref(db, `fixtures/${id}`), {
      id, date, venue, home, away,
      createdAt: fixtures[id]?.createdAt || Date.now(),
      updatedAt: Date.now(),
      updatedBy: currentUser.uid
    }));

    audit(`${editingFixtureId ? "Edit" : "Add"} fixture ${home} vs ${away} (${date})`);

    fixtureForm.classList.add("hidden");
    editingFixtureId = null;
    alert("Fixture saved ✅");
  } catch (err) {
    console.error("Save fixture failed:", err);
    alert("Save fixture failed:\n" + (err?.message || err));
  }
};

async function deleteFixture(id){
  if(!isAdmin()) return;
  if(!confirm("Delete this fixture (and its scoresheet/result)?")) return;
  await writeWithSync(remove(ref(db, `fixtures/${id}`)));
  // Also cleanup
  await writeWithSync(remove(ref(db, `scoresheets/${id}`)));
  await writeWithSync(remove(ref(db, `results/${id}`)));
  audit(`Delete fixture ${id}`);
}

function setupFixturesListener(){
  onValue(ref(db, "fixtures"), (snap) => {
    fixtures = snap.exists() ? snap.val() : {};
    renderFixturesList();
    renderFixtureSelects();

    if(!selectedFixtureId){
      const first = Object.keys(fixtures).sort((a,b)=>Number(a)-Number(b))[0];
      if(first){
        selectedFixtureId = first;
        fixtureSelect.value = first;
        loadScoresheetForFixture(first);
      }
    } else {
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
          ${isAdmin() ? `<button class="secondary" onclick="window.__editFix('${id}')">Edit</button>` : ``}
          ${isAdmin() ? `<button class="secondary danger" onclick="window.__delFix('${id}')">Delete</button>` : ``}
        </div>
      </div>
    `;
  }).join("");

  window.__delFix = deleteFixture;
  window.__editFix = (id) => {
    const f = fixtures[id];
    if(!f) return;
    editingFixtureId = id;
    fixtureFormTitle.textContent = "Edit Fixture";
    fixtureFormHint.textContent = "Editing will not affect confirmed results unless you unlock + reconfirm.";
    fixDate.value = f.date || "";
    fixVenue.value = f.venue || "";
    fixHome.value = f.home || TEAMS[0];
    fixAway.value = f.away || TEAMS[1];
    fixtureForm.classList.remove("hidden");
  };

  window.__openSheet = (id) => {
    // switch tab
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
  const opts = ids.map(id => {
    const f = fixtures[id];
    return `<option value="${id}">${escapeHtml(f.date)} — ${escapeHtml(f.home)} vs ${escapeHtml(f.away)}</option>`;
  }).join("");

  fixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
  unlockFixtureSelect.innerHTML = opts || `<option value="">No fixtures</option>`;
}

// Scoresheets
fixtureSelect.onchange = () => {
  const id = fixtureSelect.value;
  selectedFixtureId = id || null;
  if(id) loadScoresheetForFixture(id);
};

let activeSheetUnsub = null;
function loadScoresheetForFixture(id){
  const f = fixtures[id];
  if(!f) return;

  fixtureMeta.textContent = `${f.date} · ${f.venue}`;
  homeTeam.value = f.home;
  awayTeam.value = f.away;

  // IMPORTANT: avoid stacking listeners
  if(activeSheetUnsub) activeSheetUnsub();

  activeSheetUnsub = onValue(ref(db, `scoresheets/${id}`), (snap) => {
    const sheet = snap.exists() ? snap.val() : null;
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

  if(selectedSheetConfirmed && !isSystem()){
    return alert("This match is locked. Only System Creator can unlock.");
  }

  const frames = [...framesDiv.querySelectorAll("select")].map(s => s.value);

  try {
    await writeWithSync(set(ref(db, `scoresheets/${selectedFixtureId}`), {
      fixtureId: selectedFixtureId,
      frames,
      confirmed: false,
      updatedAt: Date.now(),
      updatedBy: currentUser.uid
    }));
    audit(`Save scoresheet fixture ${selectedFixtureId}`);
    alert("Saved ✅");
  } catch (e) {
    alert("Save failed:\n" + (e?.message || e));
  }
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

  try {
    await writeWithSync(set(ref(db, `results/${selectedFixtureId}`), {
      fixtureId: selectedFixtureId,
      home: f.home,
      away: f.away,
      homeWins,
      awayWins,
      confirmed: true,
      confirmedAt: Date.now(),
      confirmedBy: currentUser.uid
    }));

    await writeWithSync(update(ref(db, `scoresheets/${selectedFixtureId}`), { confirmed: true }));

    audit(`Confirm match fixture ${selectedFixtureId} (${f.home} ${homeWins}-${awayWins} ${f.away})`);
    await renderTable();

    alert("Confirmed & locked ✅");
  } catch(e) {
    alert("Confirm failed:\n" + (e?.message || e));
  }
};

// League table
function baseTable(){
  return TEAMS.map(t => ({ team: t, P: 0, FF: 0, FA: 0, PTS: 0 }));
}

async function renderTable(){
  if(!tableBody) return;

  const rows = baseTable();
  const idx = Object.fromEntries(rows.map((r,i)=>[r.team,i]));

  const rsnap = await get(ref(db, "results"));
  let confirmedCount = 0;

  if(rsnap.exists()){
    Object.values(rsnap.val()).forEach(m => {
      if(!m || !m.confirmed) return;
      const h = rows[idx[m.home]];
      const a = rows[idx[m.away]];
      if(!h || !a) return;

      confirmedCount++;
      h.P++; a.P++;
      h.FF += m.homeWins; h.FA += m.awayWins; h.PTS += m.homeWins;
      a.FF += m.awayWins; a.FA += m.homeWins; a.PTS += m.awayWins;
    });
  }

  rows.sort((x,y)=> (y.PTS-x.PTS) || ((y.FF-y.FA)-(x.FF-x.FA)) || (y.FF-x.FF) || x.team.localeCompare(y.team));

  tableBody.innerHTML = rows.map((r,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(r.team)}</td><td>${r.P}</td><td>${r.FF}</td><td>${r.FA}</td><td>${r.PTS}</td></tr>`).join("");

  // Dashboard stats
  statMatches.textContent = String(confirmedCount);
  const rack = rows.find(r => r.team === "Rack Café Utd");
  statPoints.textContent = String(rack ? rack.PTS : 0);

  // Top performer (team-based for now: top team)
  if(confirmedCount === 0){
    topPerformer.textContent = "No one yet — no games have been played.";
  } else {
    const leader = rows[0];
    topPerformer.textContent = `${leader.team} lead with ${leader.PTS} frame points (${leader.FF}-${leader.FA}).`;
  }
}

// System tools
resetTableBtn.onclick = async () => {
  if(!isSystem()) return;
  if(!confirm("Reset ALL results? (League table will clear)")) return;
  await writeWithSync(remove(ref(db, "results")));
  audit("Reset league table (results cleared)");
  renderTable();
};

resetSheetsBtn.onclick = async () => {
  if(!isSystem()) return;
  if(!confirm("Reset ALL scoresheets? (Unconfirms everything)")) return;
  await writeWithSync(remove(ref(db, "scoresheets")));
  audit("Reset all scoresheets");
};

unlockFixtureBtn.onclick = async () => {
  if(!isSystem()) return;
  const id = unlockFixtureSelect.value;
  if(!id) return alert("Select a fixture");

  await writeWithSync(update(ref(db, `scoresheets/${id}`), { confirmed: false }));
  await writeWithSync(remove(ref(db, `results/${id}`)));

  audit(`Unlock fixture ${id} (result removed + sheet unlocked)`);
  renderTable();
};

// Audit log
function setupAuditListener(){
  if(!auditLog) return;
  onValue(ref(db, "audit"), (snap) => {
    if(!snap.exists()){
      auditLog.innerHTML = `<div class="card"><strong>Audit Log</strong><br><small class="muted">No entries yet</small></div>`;
      return;
    }
    const list = Object.values(snap.val()).sort((a,b)=>b.ts-a.ts).slice(0,12);
    auditLog.innerHTML = `
      <div class="card" style="margin:0">
        <strong>Audit Log (latest)</strong>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
          ${list.map(e=>`
            <div style="border:1px solid #1e293b;border-radius:12px;padding:10px">
              <div><strong>${escapeHtml(e.action)}</strong></div>
              <small class="muted">${new Date(e.ts).toLocaleString()}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  });
}
