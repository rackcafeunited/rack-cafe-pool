// Firebase v9
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
  set
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

// UI
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");
const logoutBtn = document.getElementById("logoutBtn");

const adminTab = document.getElementById("adminTab");
const systemTab = document.getElementById("systemTab");

const sections = document.querySelectorAll("section");
const navButtons = document.querySelectorAll("nav button");

// NAVIGATION
navButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    navButtons.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    sections.forEach(sec => sec.classList.add("hidden"));
    document.getElementById(btn.dataset.tab).classList.remove("hidden");
  });
});

// LOGOUT
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  location.reload();
});

// AUTH STATE
onAuthStateChanged(auth, async user => {
  if (!user) return;

  const uid = user.uid;
  const userRef = ref(db, `users/${uid}`);
  let snap = await get(userRef);

  if (!snap.exists()) {
    const role =
      user.email === "thayessmith@rackcafeutd.com"
        ? "system-creator"
        : "player";

    await set(userRef, {
      name: user.email.split("@")[0],
      email: user.email,
      role
    });
    snap = await get(userRef);
  }

  const data = snap.val();

  headerName.textContent = data.name;
  headerRole.textContent = data.role;

  // ROLE GATES
  if (["captain", "co-captain", "system-creator"].includes(data.role)) {
    adminTab.classList.remove("hidden");
  }

  if (data.role === "system-creator") {
    systemTab.classList.remove("hidden");
  }
});
