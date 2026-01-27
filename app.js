import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
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

// UI elements expected by original UI
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");
const headerName = document.getElementById("headerName");
const headerRole = document.getElementById("headerRole");

// Login
if (loginBtn) {
  loginBtn.onclick = async () => {
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
      if (err.code === "auth/user-not-found") {
        // auto-create account
        try {
          await createUserWithEmailAndPassword(auth, email, password);
        } catch (e) {
          loginError.textContent = e.message;
          loginError.style.display = "block";
        }
      } else {
        loginError.textContent = err.message;
        loginError.style.display = "block";
      }
    }
  };
}

// Logout
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    location.reload();
  };
}

// Auth state
onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const uref = ref(db, `users/${user.uid}`);
  let snap = await get(uref);
  if (!snap.exists()) {
    await set(uref, {
      email: user.email,
      name: user.email.split("@")[0],
      role: user.email === "thayessmith@rackcafeutd.com" ? "system-creator" : "player"
    });
    snap = await get(uref);
  }

  const u = snap.val();
  if (headerName) headerName.textContent = u.name;
  if (headerRole) headerRole.textContent = u.role;
});
