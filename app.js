import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, get, onValue, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

/* ================= FIREBASE ================= */
const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ================= UI ================= */
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");
const playersList = document.getElementById("playersList");

/* ================= NAV ================= */
const sections = document.querySelectorAll("section");

document.querySelectorAll("nav button[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    sections.forEach(s => s.classList.add("hidden"));
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.remove("hidden");
  });
});

/* ================= STATE ================= */
let currentUser = null;
let currentRole = "player";
let usersCache = {};
let rosterCache = {};

/* ================= HELPERS ================= */
const isAdmin = () => ["captain","co-captain","system-creator"].includes(currentRole);
const isSystem = () => currentRole === "system-creator";

function escapeHtml(s){
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[c]));
}

/* ================= AUTH ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  currentUser = user;

  const uref = ref(db, `users/${user.uid}`);
  let snap = await get(uref);

  if (!snap.exists()) {
    await set(uref, {
      name: user.email.split("@")[0],
      email: user.email,
      role: user.email === "thayessmith@rackcafeutd.com"
        ? "system-creator"
        : "player",
      secondaryRole: user.email === "thayessmith@rackcafeutd.com"
        ? "co-captain"
        : null
    });
    snap = await get(uref);
  }

  const u = snap.val();
  currentRole = u.role;

  headerName.textContent = u.name;
  headerRole.textContent = u.secondaryRole
    ? `${u.role} + ${u.secondaryRole}`
    : u.role;

  if (isAdmin()) adminTab.classList.remove("hidden");
  if (isSystem()) systemTab.classList.remove("hidden");

  setupUsersListener();
  setupRosterListener();
});

/* ================= USERS ================= */
function setupUsersListener(){
  onValue(ref(db, "users"), snap => {
    usersCache = snap.exists() ? snap.val() : {};
    renderPlayers();
  });
}

/* ================= ROSTER ================= */
function setupRosterListener(){
  onValue(ref(db, "rosterByEmail"), snap => {
    rosterCache = snap.exists() ? snap.val() : {};
    renderPlayers();
  });
}

/* ================= PLAYERS ================= */
function renderPlayers(){
  if (!playersList) return;

  const users = Object.entries(usersCache).map(([uid,data]) => ({ uid, ...data }));
  const roster = Object.values(rosterCache || []);

  const merged = roster.map(r => {
    const match = users.find(u => u.email?.toLowerCase() === r.email?.toLowerCase());
    return match ? { ...r, ...match, linked:true } : { ...r, linked:false };
  });

  const extras = users.filter(u =>
    !roster.some(r => r.email?.toLowerCase() === u.email?.toLowerCase())
  );

  const finalList = [...merged, ...extras];

  if (finalList.length === 0) {
    playersList.innerHTML = `<div class="card">No players yet</div>`;
    return;
  }

  playersList.innerHTML = finalList
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(p => `
      <div class="fixture">
        <div>
          <strong>${escapeHtml(p.name)}</strong><br>
          <small>
            ${escapeHtml(p.email)} · ${escapeHtml(p.role || "player")}
            ${p.linked ? "" : " · (not logged in yet)"}
          </small>
        </div>
        <div class="right">
          <span class="pill">${p.uid ? "ACTIVE" : "ROSTER"}</span>
        </div>
      </div>
    `).join("");
}

/* ================= LOGOUT ================= */
logoutBtn.onclick = async () => {
  await signOut(auth);
  location.reload();
};
