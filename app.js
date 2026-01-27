import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, get, set, update, push, remove, onValue } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

/* ===================== FIREBASE ===================== */
const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ===================== CONSTANTS ===================== */
const TEAMS = [
  "Rack Café Utd","Ashfield Massive","Carlton Club","Monkey Club",
  "Longwood BC Wednesday","BYE","Marsh Lib","Junction (Marsh) 'A'",
  "Milnsbridge Lib 'D'","Cavalry Arms Jaegars"
];
const FRAMES = 10;

/* ===================== UI ===================== */
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");

const playersList = document.getElementById("playersList");

/* ===================== STATE ===================== */
let currentUser = null;
let currentRole = "player";
let usersCache = {};     // users/{uid}
let rosterCache = {};    // rosterByEmail

/* ===================== HELPERS ===================== */
const isAdmin = () => ["captain","co-captain","system-creator"].includes(currentRole);
const isSystem = () => currentRole === "system-creator";

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ===================== AUTH ===================== */
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
      secondaryRole: user.email === "thayessmith@rackcafeutd.com" ? "co-captain" : null
    });
    usnap = await get(uref);
  }

  const u = usnap.val();
  currentRole = u.role || "player";

  headerName.textContent = u.name;
  headerRole.textContent = u.secondaryRole
    ? `${u.role} + ${u.secondaryRole}`
    : u.role;

  if(isAdmin()) adminTab.classList.remove("hidden");
  if(isSystem()) systemTab.classList.remove("hidden");

  setupUsersListener();
  setupRosterListener();
});

/* ===================== USERS ===================== */
function setupUsersListener(){
  onValue(ref(db,"users"), snap => {
    usersCache = snap.exists() ? snap.val() : {};
    renderPlayers();
  });
}

/* ===================== ROSTER ===================== */
function setupRosterListener(){
  onValue(ref(db,"rosterByEmail"), snap => {
    rosterCache = snap.exists() ? snap.val() : {};
    renderPlayers();
  });
}

/* ===================== PLAYERS VIEW ===================== */
function renderPlayers(){
  if(!playersList) return;

  const usersList = Object.entries(usersCache)
    .map(([uid,data]) => ({ uid, ...data }));

  const rosterList = Object.values(rosterCache || {});

  // Merge roster + logged-in users by email
  const merged = rosterList.map(r => {
    const match = usersList.find(u =>
      (u.email||"").toLowerCase() === (r.email||"").toLowerCase()
    );
    return match
      ? { ...r, ...match, linked:true }
      : { ...r, linked:false };
  });

  // Add logged-in users not in roster
  const extras = usersList.filter(u =>
    !rosterList.some(r =>
      (r.email||"").toLowerCase() === (u.email||"").toLowerCase()
    )
  );

  const finalList = [...merged, ...extras.map(u=>({ ...u, linked:true }))];

  if(finalList.length === 0){
    playersList.innerHTML = `
      <div class="card">
        <strong>No players yet</strong><br>
        <small>Players appear after login or roster entry.</small>
      </div>`;
    return;
  }

  playersList.innerHTML = finalList
    .sort((a,b)=> (a.name||"").localeCompare(b.name||""))
    .map(p => `
      <div class="fixture">
        <div>
          <strong>${escapeHtml(p.name || "player")}</strong><br>
          <small>
            ${escapeHtml(p.email || "")}
            · role: ${escapeHtml(
              p.role ||
              (Array.isArray(p.roles) ? p.roles.join(", ") : "player")
            )}
            ${p.linked ? "" : " · (not logged in yet)"}
          </small>
        </div>
        <div class="right">
          ${p.uid
            ? `<span class="pill">UID: ${escapeHtml(p.uid.slice(0,6))}…</span>`
            : `<span class="pill">ROSTER</span>`}
        </div>
      </div>
    `).join("");
}

/* ===================== LOGOUT ===================== */
logoutBtn.onclick = async () => {
  await signOut(auth);
  location.reload();
};
