import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

/* FIREBASE */
const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* UI */
const loginScreen = document.getElementById("loginScreen");
const appContainer = document.getElementById("appContainer");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeName = document.getElementById("welcomeName");
const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");
const playersList = document.getElementById("playersList");

/* LOGIN */
loginBtn.addEventListener("click", async () => {
  loginError.style.display = "none";

  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    loginError.textContent = "Enter email and password";
    loginError.style.display = "block";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = "block";
  }
});

/* AUTH STATE */
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  loginScreen.classList.add("hidden");
  appContainer.classList.remove("hidden");

  const uref = ref(db, `users/${user.uid}`);
  let snap = await get(uref);

  if (!snap.exists()) {
    await set(uref, {
      email: user.email,
      name: user.email.split("@")[0],
      role: user.email === "thayessmith@rackcafeutd.com"
        ? "system-creator"
        : "player"
    });
    snap = await get(uref);
  }

  const u = snap.val();
  welcomeName.textContent = u.name;

  if (["captain","co-captain","system-creator"].includes(u.role)) {
    adminTab.classList.remove("hidden");
  }
  if (u.role === "system-creator") {
    systemTab.classList.remove("hidden");
  }

  onValue(ref(db, "users"), snap => {
    if (!snap.exists()) return;
    const users = Object.values(snap.val());
    playersList.innerHTML = users
      .map(u => `<div>${u.name} (${u.role})</div>`)
      .join("");
  });
});

/* LOGOUT */
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

/* NAV */
const sections = document.querySelectorAll("section");
document.querySelectorAll("nav button[data-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    sections.forEach(s => s.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
  });
});
