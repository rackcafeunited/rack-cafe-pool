// Firebase v9 (modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } 
  from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase, ref, get, set } 
  from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// 🔥 YOUR FIREBASE CONFIG
const firebaseConfig = {
  apiKey: "AIzaSyAiRXtpn52GM2Rqi-FpdXvWxBjebAjd6_I",
  authDomain: "rackcafepool.firebaseapp.com",
  databaseURL: "https://rackcafepool-default-rtdb.firebaseio.com",
  projectId: "rackcafepool"
};

// Init Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// UI refs
const loginCard = document.getElementById("loginCard");
const appCard = document.getElementById("appCard");
const loginError = document.getElementById("loginError");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");

const userNameEl = document.getElementById("userName");
const userRoleEl = document.getElementById("userRole");

// LOGIN
loginBtn.addEventListener("click", async () => {
  loginError.style.display = "none";
  try {
    await signInWithEmailAndPassword(
      auth,
      emailInput.value.trim(),
      passwordInput.value
    );
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = "block";
  }
});

// LOGOUT
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

// AUTH STATE
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    loginCard.classList.remove("hidden");
    appCard.classList.add("hidden");
    return;
  }

  // User logged in
  loginCard.classList.add("hidden");
  appCard.classList.remove("hidden");

  const uid = user.uid;
  const userRef = ref(db, `users/${uid}`);
  const snap = await get(userRef);

  // First login → create profile
  if (!snap.exists()) {
    const role =
      user.email === "thayessmith@rackcafeutd.com"
        ? "system-creator"
        : "player";

    await set(userRef, {
      email: user.email,
      name: user.email.split("@")[0],
      role
    });
  }

  const data = (await get(userRef)).val();
  userNameEl.textContent = data.name;
  userRoleEl.textContent = data.role;
});
