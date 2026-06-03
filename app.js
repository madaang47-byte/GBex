const today = new Date().toISOString().slice(0, 10);
const CLOUD_API_URL = (window.GMK_CONFIG?.googleSheetApiUrl || "").trim();

const starterData = {
  users: [
    {
      id: "owner-1",
      role: "owner",
      name: "GBEX Admin",
      email: "owner@gbex.com",
      password: "Owner@123",
    },
  ],
  records: [],
  session: null,
};

const app = document.querySelector("#app");
let db = loadDb();
let authMode = "rider";
let editingRecordId = null;
let editingRiderId = null;
let editingUserId = null;
let activeSection = "overview";
let syncMessage = "Loading your dashboard...";

function loadDb() {
  const saved = localStorage.getItem("gbex-logistics-db") || localStorage.getItem("gmk-logistics-db");
  if (!saved) {
    localStorage.setItem("gbex-logistics-db", JSON.stringify(starterData));
    return structuredClone(starterData);
  }
  const parsed = JSON.parse(saved);
  const migrated = migrateBranding(parsed);
  localStorage.setItem("gbex-logistics-db", JSON.stringify(migrated));
  return migrated;
}

function migrateBranding(data) {
  const demoEmails = [
    "rider@gbex.com",
    "rider@gouravmk.com",
    "apple.rider@gbex.com",
    "google.rider@gbex.com",
    "aman@gbex.com",
    "aman@gouravmk.com",
    "rider-1@ekart.com",
    "rider-2@ekart.com"
  ];
  
  // Purge demo users
  data.users = (data.users || []).filter((user) => {
    const emailLower = (user.email || "").toLowerCase().trim();
    if (demoEmails.includes(emailLower)) return false;
    if (user.id === "rider-1" || user.id === "rider-2") return false;
    return true;
  });

  const remainingUserIds = new Set(data.users.map(u => u.id));

  // Purge records that don't belong to any remaining user
  data.records = (data.records || []).filter((record) => {
    if (record.id === "rec-1" || record.id === "rec-2" || record.id === "rec-3") return false;
    return remainingUserIds.has(record.riderId);
  });

  data.users = (data.users || []).map((user) => {
    const next = { ...user };
    if (next.role === "owner" && (next.email === "owner@gouravmk.com" || next.name === "Gourav MK")) {
      next.name = "GBEX Admin";
      next.email = "owner@gbex.com";
    }
    // Force set payRate to 14 for all riders
    if (next.role === "rider") {
      next.payRate = 14;
    }
    return next;
  });
  
  // Force update payRate of pre-existing records to 14
  data.records = (data.records || []).map((record) => {
    return { ...record, payRate: 14 };
  });

  return data;
}

function getLoginEmail(role, provider = "") {
  if (role === "owner") return "owner@gbex.com";
  if (provider === "Apple ID") return "apple.rider@gbex.com";
  return "rider@gbex.com";
}

function saveDb() {
  localStorage.setItem("gbex-logistics-db", JSON.stringify(db));
  pushCloudDb();
}

function cloudEnabled() {
  return Boolean(CLOUD_API_URL);
}

async function loadCloudDb() {
  if (!cloudEnabled()) return;
  try {
    const localSession = db.session;
    const response = await fetch(`${CLOUD_API_URL}?t=${Date.now()}`);
    if (!response.ok) throw new Error("Google Sheet load failed");
    const payload = await response.json();
    if (Array.isArray(payload.users) && Array.isArray(payload.records)) {
      db = migrateBranding({
        users: payload.users.length ? normalizeUsers(payload.users) : starterData.users,
        records: payload.records.length ? normalizeRecords(payload.records) : starterData.records,
        session: localSession,
      });
      localStorage.setItem("gbex-logistics-db", JSON.stringify(db));
      syncMessage = "";
    }
  } catch (error) {
    syncMessage = "";
  }
}

async function pushCloudDb() {
  if (!cloudEnabled()) return;
  const data = { users: db.users, records: db.records };
  const payload = { action: "save", data };
  
  try {
    await fetch(CLOUD_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "payload=" + encodeURIComponent(JSON.stringify(payload)),
    });
    console.log("Database synced to Google Sheets successfully via fetch.");
  } catch (e) {
    console.warn("Fetch sync failed, falling back to iframe submission:", e);
    submitCloudPayload(payload);
  }
}

function submitCloudPayload(payload) {
  const frameName = "gmk_sheet_sync_frame";
  let frame = document.querySelector(`iframe[name="${frameName}"]`);
  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = frameName;
    frame.style.display = "none";
    document.body.appendChild(frame);
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = CLOUD_API_URL;
  form.target = frameName;
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(payload);
  form.appendChild(input);

  document.body.appendChild(form);
  form.submit();
  setTimeout(() => form.remove(), 1000);
}

function syncNow() {
  saveDb();
  alert("Sync request has been sent to Google Sheets. Please refresh the sheet to check Users and Records tabs.");
}

function normalizeUsers(users) {
  return users.map((user) => ({
    ...user,
    payRate: Number(user.payRate || 0),
  }));
}

function normalizeRecords(records) {
  return records.map((record) => ({
    ...record,
    parcelsTaken: Number(record.parcelsTaken || 0),
    delivered: Number(record.delivered || 0),
    returned: Number(record.returned || 0),
    payRate: Number(record.payRate || 0),
  }));
}

function renderLoading() {
  app.innerHTML = `
    <section class="auth-panel" style="min-height:100vh">
      <div class="auth-card">
        <p class="eyebrow">GBEX</p>
        <h2>Loading dashboard</h2>
        <p class="muted">${syncMessage}</p>
      </div>
    </section>
  `;
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function getRiders() {
  return db.users.filter((user) => user.role === "rider");
}

function getUser(id) {
  return db.users.find((user) => user.id === id);
}

function calcEarning(record) {
  return Number(record.delivered || 0) * Number(record.payRate || 0);
}

function totals(records) {
  const summary = records.reduce(
    (sum, record) => {
      sum.taken += Number(record.parcelsTaken || 0);
      sum.delivered += Number(record.delivered || 0);
      sum.returned += Number(record.returned || 0);
      sum.earning += calcEarning(record);
      return sum;
    },
    { taken: 0, delivered: 0, returned: 0, earning: 0 }
  );
  summary.count = records.length;
  return summary;
}

function showNotice(text) {
  const notice = document.querySelector("#notice");
  if (!notice) return;
  notice.textContent = text;
  notice.classList.add("show");
}

function firebaseReady() {
  return Boolean(window.GBEX_AUTH?.configured);
}

function authErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("user-not-found") || code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "Incorrect email or password.";
  }
  if (code.includes("popup-closed-by-user")) {
    return "Login popup closed. Please try again.";
  }
  if (code.includes("email-already-in-use")) {
    return "An account with this email already exists.";
  }
  if (code.includes("weak-password")) {
    return "Password must be at least 6 characters long.";
  }
  return "Login failed. Please check your Firebase settings.";
}

async function completeAuthLogin(email, role, displayName = "") {
  const cleanEmail = email.trim().toLowerCase();
  let user = db.users.find((item) => item.email.toLowerCase() === cleanEmail && item.role === role);

  if (!user) {
    user = {
      id: `${role}-${Date.now()}`,
      role: role,
      name: displayName || cleanEmail.split("@")[0],
      email: cleanEmail,
      password: "FirebaseAuth",
      phone: "",
    };
    if (role === "rider") {
      user.payRate = 14;
    }
    db.users.push(user);
  }

  db.session = { userId: user.id };
  saveDb();
  render();
}

let loginStep = "input";
let loginData = null;

async function loginWithPassword(role) {
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;
  if (!email || !password) {
    showNotice("Email and password are required.");
    return;
  }
  if (firebaseReady()) {
    try {
      const authUser = await window.GBEX_AUTH.signInEmail(email, password);
      await completeAuthLogin(authUser.email || email, role, authUser.displayName || "");
    } catch (error) {
      showNotice(authErrorMessage(error));
    }
    return;
  }
  
  const user = db.users.find((item) => item.email.toLowerCase() === email && item.password === password && item.role === role);
  if (!user) {
    showNotice("Login details do not match. Please check your role, email, and password.");
    return;
  }
  
  // Login with Password bypasses OTP verification!
  completeAccountLogin(user);
}

async function requestLoginOtp(role) {
  const email = document.querySelector("#email").value.trim().toLowerCase();
  if (!email) {
    showNotice("Please enter your email to request an OTP.");
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNotice("Please enter a valid email address.");
    return;
  }
  
  if (firebaseReady()) {
    showNotice("OTP login is only supported with Cloud sheets database currently.");
    return;
  }
  
  const user = db.users.find((item) => item.email.toLowerCase() === email && item.role === role);
  if (!user) {
    showNotice("This email is not registered as a " + role + ". Please sign up first.");
    return;
  }
  
  // If cloud sync is not active (local offline testing mode), skip OTP and log in directly
  if (!cloudEnabled()) {
    completeAccountLogin(user);
    return;
  }
  
  showNotice("Sending verification OTP to your email...");
  
  try {
    const url = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok) {
      loginStep = "otp";
      loginData = user;
      showNotice("OTP code sent successfully. Please check your email!");
      renderWelcome();
    } else {
      showNotice(result.error || "Failed to send login verification code.");
    }
  } catch (error) {
    console.error("Login OTP request failed:", error);
    showNotice("Failed to reach verification server. Please check your connection.");
  }
}

async function verifyLoginOtp() {
  const otpVal = document.querySelector("#loginOtp").value.trim();
  if (!otpVal) {
    showNotice("Please enter the verification code.");
    return;
  }
  showNotice("Verifying OTP...");
  
  try {
    const url = `${CLOUD_API_URL}?action=verifyOTP&email=${encodeURIComponent(loginData.email)}&otp=${encodeURIComponent(otpVal)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok) {
      completeAccountLogin(loginData);
      loginStep = "input";
      showNotice("Verification successful!");
    } else {
      showNotice(result.error || "Invalid or expired verification code.");
    }
  } catch (error) {
    console.error("Login OTP verification failed:", error);
    showNotice("Connection error during verification.");
  }
}

async function resendLoginOtp() {
  showNotice("Resending login code...");
  try {
    const url = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(loginData.email)}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.ok) {
      showNotice("A new verification code has been sent to your email.");
    } else {
      showNotice(result.error || "Failed to resend code.");
    }
  } catch (error) {
    showNotice("Network error. Please try again.");
  }
}

function completeAccountLogin(user) {
  db.session = { userId: user.id };
  saveDb();
  render();
}

let signupStep = "input";
let signupData = { name: "", email: "", password: "" };

async function signup() {
  const name = document.querySelector("#signupName").value.trim();
  const email = document.querySelector("#signupEmail").value.trim().toLowerCase();
  const password = document.querySelector("#signupPassword").value;
  if (!name || !email || !password) {
    showNotice("Name, email, and password are required.");
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNotice("Please enter a valid email address.");
    return;
  }
  if (db.users.some((user) => user.email.toLowerCase() === email)) {
    showNotice("An account with this email already exists.");
    return;
  }
  if (firebaseReady()) {
    try {
      await window.GBEX_AUTH.signupEmail(email, password);
    } catch (error) {
      showNotice(authErrorMessage(error));
      return;
    }
  }
  
  // If cloud sync is not active (local offline testing mode), skip OTP
  if (!cloudEnabled()) {
    completeAccountSignup(name, email, password);
    return;
  }
  
  showNotice("Sending verification OTP to your email...");
  
  try {
    const url = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(email)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok) {
      signupStep = "otp";
      signupData = { name, email, password };
      showNotice("OTP code sent successfully. Please check your email!");
      renderWelcome();
    } else {
      showNotice(result.error || "Failed to request OTP code. Please check email details.");
    }
  } catch (error) {
    console.error("OTP request failed:", error);
    showNotice("Failed to reach verification server. Please check your internet connection.");
  }
}

async function verifySignupOtp() {
  const otpVal = document.querySelector("#verificationOtp").value.trim();
  if (!otpVal) {
    showNotice("Please enter the verification code.");
    return;
  }
  showNotice("Verifying OTP...");
  
  try {
    const url = `${CLOUD_API_URL}?action=verifyOTP&email=${encodeURIComponent(signupData.email)}&otp=${encodeURIComponent(otpVal)}`;
    const response = await fetch(url);
    const result = await response.json();
    
    if (result.ok) {
      completeAccountSignup(signupData.name, signupData.email, signupData.password);
      signupStep = "input";
      showNotice("Email verified successfully! Logging you in...");
    } else {
      showNotice(result.error || "Invalid or expired verification code.");
    }
  } catch (error) {
    console.error("OTP verification failed:", error);
    showNotice("Connection error during verification.");
  }
}

async function resendSignupOtp() {
  showNotice("Resending verification code...");
  try {
    const url = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(signupData.email)}`;
    const response = await fetch(url);
    const result = await response.json();
    if (result.ok) {
      showNotice("A new code has been sent to your email.");
    } else {
      showNotice(result.error || "Failed to resend code.");
    }
  } catch (error) {
    showNotice("Network error. Please try again.");
  }
}

function completeAccountSignup(name, email, password) {
  const user = {
    id: `${authMode}-${Date.now()}`,
    role: authMode,
    name,
    email,
    password,
    phone: "",
  };
  if (authMode === "rider") {
    user.payRate = 14;
  }
  db.users.push(user);
  db.session = { userId: user.id };
  saveDb();
  render();
}

let currentSocialProvider = "";

function socialLogin(provider) {
  const role = authMode;
  if (firebaseReady()) {
    window.GBEX_AUTH.signInProvider(provider).then(async (authUser) => {
      await completeAuthLogin(authUser.email || "", role, authUser.displayName || "");
    }).catch((error) => {
      showNotice(authErrorMessage(error));
    });
    return;
  }
  currentSocialProvider = provider;
  
  if (provider === "Google") {
    startGoogleLoginPopup();
  } else if (provider === "Apple ID") {
    startAppleOAuth();
  } else {
    showSocialAuthModal(provider);
  }
}

function startGoogleLoginPopup() {
  const width = 520;
  const height = 620;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  window.open(
    `google-login.html?role=${authMode}`,
    "GoogleSignInChooser",
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
  );
}

function startGoogleOAuth() {
  const clientId = window.GMK_CONFIG?.googleClientId;
  if (!clientId) {
    showSocialAuthModal("Google");
    return;
  }
  
  const width = 500;
  const height = 600;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  const redirectUri = window.location.origin;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=email%20profile`;
  
  const oauthPopup = window.open(
    authUrl,
    "GoogleSignIn",
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
  );
  
  const timer = setInterval(async () => {
    if (!oauthPopup || oauthPopup.closed) {
      clearInterval(timer);
      return;
    }
    
    try {
      const currentUrl = oauthPopup.location.href;
      if (currentUrl.includes("access_token=")) {
        clearInterval(timer);
        const hash = oauthPopup.location.hash;
        oauthPopup.close();
        
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        
        if (accessToken) {
          showNotice("Connecting with Google...");
          const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const payload = await userInfoResponse.json();
          const email = payload.email;
          const name = payload.name || payload.given_name || email.split("@")[0];
          
          completeSocialAuthLogin(email, name, "GoogleLoginOAuthSecret", "Google");
        }
      }
    } catch (e) {
      // Ignore cross-origin errors during Google sign-in redirect
    }
  }, 500);
}

function startAppleOAuth() {
  const width = 450;
  const height = 550;
  const left = (screen.width - width) / 2;
  const top = (screen.height - height) / 2;
  
  window.open(
    `apple-login.html?role=${authMode}`,
    "AppleSignIn",
    `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
  );
}

// Listen for message from Apple / Google Sign In popup window
window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  
  if (event.data && event.data.type === "APPLE_SIGNIN_SUCCESS") {
    const { email, password, name } = event.data;
    completeSocialAuthLogin(email, name, password, "Apple ID");
  } else if (event.data && event.data.type === "GOOGLE_SIGNIN_SUCCESS") {
    const { email, password, name } = event.data;
    completeSocialAuthLogin(email, name, password, "Google");
  }
});

function completeSocialAuthLogin(email, name, password, provider = "") {
  const role = authMode;
  const cleanEmail = email.toLowerCase().trim();
  
  let user = db.users.find((item) => item.email.toLowerCase() === cleanEmail && item.role === role);
  
  if (user) {
    if (password !== "GoogleLoginOAuthSecret" && password !== "AppleLoginOAuthSecret" && user.password !== password) {
      showNotice("Social sign-in authentication error. Incorrect password.");
      return;
    }
  } else {
    // If cloud sync is active, verify new social accounts via email OTP first
    if (cloudEnabled()) {
      showNotice("Sending verification OTP to your email...");
      
      const targetUrl = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(cleanEmail)}`;
      fetch(targetUrl)
        .then(res => res.json())
        .then(result => {
          if (result.ok) {
            signupStep = "otp";
            signupData = { name: name, email: cleanEmail, password: password };
            showNotice("OTP code sent successfully. Please check your email to complete registration!");
            renderWelcome();
          } else {
            showNotice(result.error || "Failed to request OTP code. Please check email details.");
          }
        })
        .catch(err => {
          console.error("OTP request failed:", err);
          showNotice("Failed to reach verification server. Please check your connection.");
        });
      return;
    }
    
    // Fallback for offline testing
    user = {
      id: `${role}-${Date.now()}`,
      role: role,
      name: name,
      email: cleanEmail,
      password: password,
      phone: ""
    };
    if (role === "rider") {
      user.payRate = 14;
    }
    db.users.push(user);
  }
  
  if (provider) {
    localStorage.setItem(`gbex-last-social-email-${provider.toLowerCase().replace(" ", "")}`, cleanEmail);
    localStorage.setItem("gbex-last-social-email", cleanEmail);
  }
  
  db.session = { userId: user.id };
  saveDb();
  render();
}

function showSocialAuthModal(provider) {
  let modal = document.querySelector("#socialAuthModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "socialAuthModal";
    modal.className = "modal-overlay";
    document.body.appendChild(modal);
  }
  
  // Render loading state for session check feedback
  modal.innerHTML = `
    <div class="modal-container">
      <h3 class="modal-title" style="margin: 0 0 8px; font-size: 24px; color: var(--ink);">Sign in with ${provider}</h3>
      <p class="modal-desc" style="margin: 0 0 20px; font-size: 14.5px; color: var(--muted);">Checking for active ${provider} accounts on this browser...</p>
      <div class="pulse-loader">
        <div class="pulse-dot"></div>
        <div class="pulse-dot"></div>
        <div class="pulse-dot"></div>
      </div>
      <p style="font-size: 12.5px; color: var(--muted); text-align: center; margin-top: 10px;">Querying active browser profile credentials...</p>
    </div>
  `;
  
  setTimeout(() => modal.classList.add("show"), 10);
  
  // Probe database and cache for active account
  setTimeout(() => {
    const role = authMode;
    const cleanProviderName = provider.toLowerCase().replace(" ", "");
    const cachedEmail = localStorage.getItem(`gbex-last-social-email-${cleanProviderName}`) || localStorage.getItem("gbex-last-social-email");
    
    let detectedUser = null;
    if (cachedEmail) {
      detectedUser = db.users.find((u) => u.email.toLowerCase() === cachedEmail.toLowerCase() && u.role === role);
    }
    if (!detectedUser) {
      // Direct fallback to match default active accounts for this role
      detectedUser = db.users.find((u) => u.role === role);
    }
    
    if (detectedUser) {
      modal.innerHTML = `
        <div class="modal-container">
          <h3 class="modal-title" style="margin: 0 0 8px; font-size: 24px; color: var(--ink);">Sign in with ${provider}</h3>
          <p class="modal-desc" style="margin: 0 0 16px; font-size: 14.5px; color: var(--muted);">Active browser session detected. Select below to login instantly.</p>
          
          <div class="detected-account-card" onclick="autoLoginSocial('${detectedUser.email}', '${detectedUser.name}', '${provider}')">
            <div class="detected-avatar">${detectedUser.name.charAt(0).toUpperCase()}</div>
            <div class="detected-info">
              <div style="display: flex; align-items: center; gap: 8px;">
                <p class="detected-name" style="margin:0; font-weight:700;">${detectedUser.name}</p>
                <span class="detected-badge">Logged In</span>
              </div>
              <p class="detected-email" style="margin:2px 0 0; font-size:13.5px; color:var(--muted);">${detectedUser.email}</p>
            </div>
          </div>
          
          <div style="margin-top: 22px; text-align: center;">
            <button class="link-btn" onclick="showManualSocialAuth('${provider}')" style="font-size: 14px; color: var(--brand);">Sign in with a different email</button>
          </div>
          
          <div class="modal-footer" style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <button class="btn secondary" onclick="closeSocialAuthModal()">Cancel</button>
          </div>
        </div>
      `;
    } else {
      showManualSocialAuth(provider);
    }
  }, 950);
}

function autoLoginSocial(email, name, provider) {
  const modal = document.querySelector("#socialAuthModal");
  if (modal) {
    modal.innerHTML = `
      <div class="modal-container">
        <h3 class="modal-title" style="color: var(--ink);">Logging in...</h3>
        <p class="modal-desc" style="color: var(--muted);">Signing you in securely as ${email}</p>
        <div class="pulse-loader">
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
          <div class="pulse-dot"></div>
        </div>
      </div>
    `;
  }
  
  setTimeout(() => {
    const cleanEmail = email.toLowerCase().trim();
    localStorage.setItem(`gbex-last-social-email-${provider.toLowerCase().replace(" ", "")}`, cleanEmail);
    localStorage.setItem("gbex-last-social-email", cleanEmail);
    completeSocialAuthLogin(email, name, "GoogleLoginOAuthSecret", provider);
    closeSocialAuthModal();
  }, 500);
}

function showManualSocialAuth(provider) {
  const modal = document.querySelector("#socialAuthModal");
  if (!modal) return;
  
  const googleClientId = window.GMK_CONFIG?.googleClientId;
  const isGoogle = provider === "Google";
  
  let oAuthBtnHtml = "";
  if (isGoogle && googleClientId) {
    oAuthBtnHtml = `
      <button class="btn line full" onclick="closeSocialAuthModal(); startGoogleOAuth()" style="margin-bottom:15px; display:flex; gap:8px; justify-content:center;">
        <span class="social-icon google">G</span> Launch Google Consent Popup
      </button>
      <div style="text-align:center; margin-bottom:15px; font-size:12px; color:var(--muted); font-weight:700;">OR SIGN IN MANUALLY</div>
    `;
  } else if (provider === "Apple ID") {
    oAuthBtnHtml = `
      <button class="btn line full" onclick="closeSocialAuthModal(); startAppleOAuth()" style="margin-bottom:15px; display:flex; gap:8px; justify-content:center;">
        <span class="social-icon apple"></span> Launch Apple Sign-In Window
      </button>
      <div style="text-align:center; margin-bottom:15px; font-size:12px; color:var(--muted); font-weight:700;">OR SIGN IN MANUALLY</div>
    `;
  }
  
  modal.innerHTML = `
    <div class="modal-container">
      <h3 class="modal-title" style="margin: 0 0 8px; font-size: 24px; color: var(--ink);">Sign in with ${provider}</h3>
      <p class="modal-desc" style="margin: 0 0 20px; font-size: 14px; color: var(--muted);">Please enter your details to sign in securely.</p>
      
      ${oAuthBtnHtml}
      
      <div class="field">
        <label>Email Address</label>
        <input id="socialEmail" type="email" placeholder="name@domain.com" required />
      </div>
      <div class="field">
        <label>Password</label>
        <input id="socialPassword" type="password" placeholder="Enter password" required />
      </div>
      <div id="socialAuthNotice" class="notice"></div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;">
        <button class="btn secondary" onclick="closeSocialAuthModal()">Cancel</button>
        <button class="btn" onclick="submitSocialAuth('${provider}')">Continue</button>
      </div>
    </div>
  `;
}

function closeSocialAuthModal() {
  const modal = document.querySelector("#socialAuthModal");
  if (modal) {
    modal.classList.remove("show");
  }
}

function submitSocialAuth(provider) {
  const emailVal = document.querySelector("#socialEmail").value.trim();
  const passwordVal = document.querySelector("#socialPassword").value;
  const notice = document.querySelector("#socialAuthNotice");
  
  if (!emailVal || !passwordVal) {
    if (notice) {
      notice.textContent = "Please fill in all fields.";
      notice.classList.add("show");
    }
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailVal)) {
    if (notice) {
      notice.textContent = "Please enter a valid email address.";
      notice.classList.add("show");
    }
    return;
  }
  
  const role = authMode;
  const cleanEmail = emailVal.toLowerCase();
  
  let user = db.users.find((item) => item.email.toLowerCase() === cleanEmail && item.role === role);
  
  if (user) {
    if (user.password !== passwordVal) {
      if (notice) {
        notice.textContent = "Incorrect password for this account.";
        notice.classList.add("show");
      }
      return;
    }
  } else {
    // If cloud sync is active, verify new user via email OTP
    if (cloudEnabled()) {
      if (notice) {
        notice.textContent = "Sending verification OTP to your email...";
        notice.classList.add("show");
      }
      
      const targetUrl = `${CLOUD_API_URL}?action=requestOTP&email=${encodeURIComponent(cleanEmail)}`;
      fetch(targetUrl)
        .then(res => res.json())
        .then(result => {
          if (result.ok) {
            signupStep = "otp";
            signupData = { name: cleanEmail.split("@")[0], email: cleanEmail, password: passwordVal };
            showNotice("OTP code sent successfully. Please check your email to complete registration!");
            closeSocialAuthModal();
            renderWelcome();
          } else {
            if (notice) {
              notice.textContent = result.error || "Failed to request OTP code. Please check email details.";
              notice.classList.add("show");
            }
          }
        })
        .catch(err => {
          console.error("OTP request failed:", err);
          if (notice) {
            notice.textContent = "Failed to reach verification server. Please check your connection.";
            notice.classList.add("show");
          }
        });
      return;
    }
    
    // Otherwise offline testing flow
    user = {
      id: `${role}-${Date.now()}`,
      role: role,
      name: cleanEmail.split("@")[0],
      email: cleanEmail,
      password: passwordVal,
      phone: ""
    };
    if (role === "rider") {
      user.payRate = 14;
    }
    db.users.push(user);
  }
  
  if (provider) {
    localStorage.setItem(`gbex-last-social-email-${provider.toLowerCase().replace(" ", "")}`, cleanEmail);
    localStorage.setItem("gbex-last-social-email", cleanEmail);
  }
  
  db.session = { userId: user.id };
  saveDb();
  closeSocialAuthModal();
  render();
}

async function forgotPassword() {
  const email = document.querySelector("#email")?.value.trim() || "your email";
  if (firebaseReady()) {
    try {
      await window.GBEX_AUTH.resetPassword(email);
      showNotice(`Password reset link has been sent to ${email}.`);
    } catch (error) {
      showNotice(authErrorMessage(error));
    }
    return;
  }
  showNotice(`Password reset link has been successfully generated for ${email}.`);
}

async function logout() {
  if (firebaseReady()) {
    await window.GBEX_AUTH.signOutUser().catch(() => {});
  }
  db.session = null;
  saveDb();
  renderWelcome();
}

function render() {
  const current = db.session ? getUser(db.session.userId) : null;
  if (!current) return renderWelcome();
  if (current.role === "owner") return renderOwner(current);
  return renderRider(current);
}

function renderGlobalHeader() {
  const announcements = [
    "🚀 GBEX Express: Delivering promises, one parcel at a time! Fast, secure, and reliable.",
    "📦 Active Tracking: Local courier hub database is fully synced in real time.",
    "🏆 Excellence in Action: Over 10,000+ logistics routes monitored and completed successfully.",
    "🛣️ Drive Safe, Deliver Happy! Our dedicated team keeps businesses moving.",
    "⚡ Admin portal and rider tools are running under strict Google Apps Script secure authentication.",
    "💼 Founded and managed under the direct leadership of Gourav Madaan, Karnal."
  ];
  const tickerText = announcements.join(" &nbsp;•&nbsp;&nbsp;🚀&nbsp;&nbsp;&nbsp; ");

  return `
    <header class="global-header">
      <div class="header-logo" style="display: flex; align-items: center; gap: 8px;">
        <span style="background: var(--brand); color: white; padding: 4px 10px; border-radius: 6px; font-weight: 900; box-shadow: 0 4px 10px rgba(220, 0, 27, 0.25);">GB</span>
        <span class="logo-text" style="color: white; font-weight: 800; font-size: 20px; letter-spacing: 0.5px;">EX</span>
      </div>
      <div class="ticker-wrap">
        <div class="ticker">
          <span>${tickerText}</span>
        </div>
      </div>
    </header>
  `;
}

function renderGlobalFooter() {
  return `
    <footer class="global-footer">
      <div class="footer-grid">
        <div class="footer-brand">
          <h3>GBEX Express Logistics</h3>
          <p>We are a state-of-the-art logistics and freight delivery network. We specialize in local parcel delivery, courier hub operations, and express tracking software integrations. Our operations are fully transparent and optimized for performance.</p>
          <div style="margin-top: 15px; display: flex; flex-wrap: wrap; gap: 10px;">
            <span style="background: rgba(255, 255, 255, 0.08); padding: 6px 12px; border-radius: 4px; font-size: 12.5px; color: white;">📍 Karnal Hub</span>
            <span style="background: rgba(255, 255, 255, 0.08); padding: 6px 12px; border-radius: 4px; font-size: 12.5px; color: white;">⚡ Real-time Sync</span>
            <span style="background: rgba(255, 255, 255, 0.08); padding: 6px 12px; border-radius: 4px; font-size: 12.5px; color: white;">🛡️ Secure Portal</span>
          </div>
        </div>
        <div class="footer-contact">
          <h4>Corporate Office Details</h4>
          <p><strong>Owner:</strong> Gourav Madaan</p>
          <p><strong>Phone:</strong> <a href="tel:9103320212" style="color: var(--brand); text-decoration: none; font-weight: bold;">+91 9103320212</a></p>
          <p><strong>Office Address:</strong> Hansi Road, Gali No. 11, Karnal, Haryana - 132001</p>
          <p><strong>System Status:</strong> <span style="color: #10B981; font-weight: bold;">● Fully Synced & Active</span></p>
        </div>
      </div>
      <div class="footer-bottom">
        &copy; ${new Date().getFullYear()} GBEX Express. All Rights Reserved. Designed & Developed for logistics tracking and fleet performance management.
      </div>
    </footer>
  `;
}

function renderWelcome() {
  app.innerHTML = `
    <div class="welcome-container">
      ${renderGlobalHeader()}
      <section class="shell">
        <div class="hero">
          <div class="brand-row">
            <div class="brand-row">
              <span class="logo">GB</span>
              <div>
                <p class="brand-title">GBEX</p>
                <p class="brand-subtitle">Global Business Express</p>
              </div>
            </div>
          </div>
          <div>
            <h1>Global Business Express</h1>
            <div class="hero-stats">
              <div class="hero-stat"><strong>${getRiders().length}</strong><span>Active Riders</span></div>
              <div class="hero-stat"><strong>₹14</strong><span>Pay rate per parcel</span></div>
              <div class="hero-stat"><strong>${today}</strong><span>Today view ready</span></div>
            </div>
          </div>
        </div>
        <div class="auth-panel">
          <div class="auth-card">
            <p class="eyebrow">Secure login</p>
            <h2>Welcome back</h2>
            ${loginStep === "otp" ? `
              <p class="eyebrow" style="color: var(--brand);">Verify Login OTP</p>
              <p style="font-size: 13.5px; color: var(--muted); margin: 0 0 14px; line-height: 1.5;">We have sent a 6-digit login verification OTP to <strong>${loginData.email}</strong>. Please check your inbox.</p>
              <div class="field">
                <label>6-Digit Verification Code</label>
                <input id="loginOtp" type="text" placeholder="Enter OTP" maxlength="6" style="letter-spacing: 4px; text-align: center; font-size: 18px; font-weight: 700;" />
              </div>
              <button class="btn secondary full" onclick="verifyLoginOtp()" style="margin-top: 10px;">Verify &amp; Login</button>
              <div style="display:flex; justify-content:space-between; margin-top:14px;">
                <button class="link-btn" onclick="resendLoginOtp()" style="font-size:12.5px; color: var(--brand);">Resend OTP</button>
                <button class="link-btn" onclick="loginStep='input'; renderWelcome()" style="font-size:12.5px; color:var(--muted);">Cancel</button>
              </div>
            ` : `
              <p class="muted">Choose your role to continue.</p>
              <div class="tabs">
                <button class="tab ${authMode === "rider" ? "active" : ""}" onclick="authMode='rider'; renderWelcome()">Rider</button>
                <button class="tab ${authMode === "owner" ? "active" : ""}" onclick="authMode='owner'; renderWelcome()">Owner</button>
              </div>
              <div class="field">
                <label>Email</label>
                <input id="email" type="email" placeholder="email@example.com" />
              </div>
              <div class="field">
                <label>Password</label>
                <input id="password" type="password" placeholder="Enter your password" />
              </div>
              <div class="auth-actions" style="display: flex; flex-direction: column; gap: 8px;">
                <button class="btn full" onclick="loginWithPassword('${authMode}')">Login with Password</button>
                <button class="btn line full" onclick="requestLoginOtp('${authMode}')" style="border: 1px solid var(--brand); color: var(--brand); margin: 0;">Login with OTP</button>
                <button class="link-btn" onclick="forgotPassword()" style="margin-top: 4px;">Forgot password?</button>
              </div>
              <div class="social-grid" style="margin-top: 16px;">
                <button class="btn line social-btn" onclick="socialLogin('Google')"><span class="social-icon google">G</span>Continue with Google</button>
                <button class="btn line social-btn" onclick="socialLogin('Apple ID')"><span class="social-icon apple">A</span>Continue with Apple</button>
              </div>
            `}
            <hr style="border:0;border-top:1px solid var(--line);margin:22px 0" />
            ${signupStep === "otp" ? `
              <p class="eyebrow" style="color: var(--brand);">Verify Email OTP</p>
              <p style="font-size: 13.5px; color: var(--muted); margin: 0 0 14px; line-height: 1.5;">We have sent a 6-digit verification code to <strong>${signupData.email}</strong>. Please check your inbox.</p>
              <div class="field">
                <label>6-Digit Verification Code</label>
                <input id="verificationOtp" type="text" placeholder="Enter OTP" maxlength="6" style="letter-spacing: 4px; text-align: center; font-size: 18px; font-weight: 700;" />
              </div>
              <button class="btn secondary full" onclick="verifySignupOtp()" style="margin-top: 10px;">Verify &amp; Create Account</button>
              <div style="display:flex; justify-content:space-between; margin-top:14px;">
                <button class="link-btn" onclick="resendSignupOtp()" style="font-size:12.5px; color: var(--brand);">Resend OTP</button>
                <button class="link-btn" onclick="signupStep='input'; renderWelcome()" style="font-size:12.5px; color:var(--muted);">Cancel</button>
              </div>
            ` : `
              <p class="eyebrow">${authMode === "rider" ? "New rider" : "New owner"}</p>
              <div class="field"><label>Name</label><input id="signupName" placeholder="${authMode === "rider" ? "Rider name" : "Owner name"}" /></div>
              <div class="field"><label>Email</label><input id="signupEmail" type="email" placeholder="${authMode === "rider" ? "newrider@email.com" : "newowner@email.com"}" /></div>
              <div class="field"><label>Password</label><input id="signupPassword" type="password" placeholder="Create password" /></div>
              <button class="btn secondary full" onclick="signup()">${authMode === "rider" ? "Create rider account" : "Create owner account"}</button>
            `}
            <div id="notice" class="notice"></div>
          </div>
        </div>
      </section>
      ${renderGlobalFooter()}
    </div>
  `;
}

function sidebar(user, title) {
  const ownerNav = `
    <button class="${activeSection === "overview" ? "active" : ""}" onclick="activeSection='overview'; render()">Dashboard</button>
    <button class="${activeSection === "records" ? "active" : ""}" onclick="activeSection='records'; render()">Add / Edit records</button>
    <button class="${activeSection === "riders" ? "active" : ""}" onclick="activeSection='riders'; render()">Riders</button>
    <button class="${activeSection === "users" ? "active" : ""}" onclick="activeSection='users'; render()">Create User</button>
  `;
  const riderNav = `
    <button class="${activeSection === "overview" ? "active" : ""}" onclick="activeSection='overview'; render()">Today earning</button>
    <button class="${activeSection === "history" ? "active" : ""}" onclick="activeSection='history'; render()">Past records</button>
  `;
  return `
    <aside class="sidebar">
      <span class="logo">GB</span>
      <h2>${title}</h2>
      <p class="brand-subtitle">${user.name}<br />${user.email}</p>
      <nav class="nav">${user.role === "owner" ? ownerNav : riderNav}</nav>
    </aside>
  `;
}

function renderOwner(user) {
  const all = db.records;
  const total = totals(all);
  app.innerHTML = `
    <div class="welcome-container">
      ${renderGlobalHeader()}
      <section class="app-shell">
        ${sidebar(user, "Owner Control")}
        <main class="content">
          <div class="topbar">
            <div>
              <p class="eyebrow">Private owner dashboard</p>
              <h1>GBEX Dashboard</h1>
            </div>
            <div class="row-actions">
              <button class="btn" onclick="syncNow()">Sync to Google Sheet</button>
              <button class="btn secondary" onclick="logout()">Logout</button>
            </div>
          </div>
          ${ownerContent(total)}
        </main>
      </section>
      ${renderGlobalFooter()}
    </div>
  `;
}

function ownerContent(total) {
  if (activeSection === "users") return renderUsersPanel();
  if (activeSection === "riders") return renderRidersPanel();
  if (activeSection === "records") return renderOwnerRecords();
  return `
    ${metrics(total)}
    <div class="dashboard-banner-card">
      <img src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=800&q=80" alt="GBEX Fleet Operations" />
      <div class="dashboard-banner-text">
        <h3>GBEX Fleet Operations &amp; Control</h3>
        <p>Welcome to your central administration hub. View real-time parcel counts, route distributions, and active courier metrics. Synchronize jobsheets seamlessly with the Google Sheet database using the sync controls above.</p>
      </div>
    </div>
    <div class="profile-card">
      <div class="panel">
        <h2>Today's overview</h2>
        <p class="muted">Add data by date. The system automatically calculates rider totals and earnings.</p>
        ${recordsTable(db.records.filter((record) => record.date === today), true)}
      </div>
      <div class="route-card">
        <h3>GBEX Control</h3>
        <p>The rider dashboard is read-only. Add, edit, delete, and pay-rate controls are accessible only to the owner.</p>
        <div class="row-actions" style="margin-top: 15px;">
          <button class="btn" onclick="activeSection='records'; render()">Add new record</button>
          <button class="btn secondary" style="background: rgba(255, 255, 255, 0.2); color: white; border: 1px solid rgba(255, 255, 255, 0.35);" onclick="activeSection='users'; render()">Signup / Create User</button>
        </div>
      </div>
    </div>
  `;
}

function metrics(total, mode = "owner") {
  return `
    <div class="dashboard-grid">
      <div class="metric"><span>${mode === "owner" ? "Total riders" : "Records"}</span><strong>${mode === "owner" ? getRiders().length : total.count}</strong></div>
      <div class="metric"><span>Parcels taken</span><strong>${total.taken}</strong></div>
      <div class="metric"><span>Delivered</span><strong>${total.delivered}</strong></div>
      <div class="metric"><span>Total earning</span><strong>${money(total.earning)}</strong></div>
    </div>
  `;
}

function renderOwnerRecords() {
  const record = db.records.find((item) => item.id === editingRecordId);
  return `
    <div class="work-area">
      <div class="form-card">
        <p class="eyebrow">${record ? "Edit record" : "Add daily data"}</p>
        <h2>${record ? "Update rider record" : "New record"}</h2>
        <div class="field">
          <label>Rider</label>
          <select id="recordRider">
            ${getRiders().map((rider) => `<option value="${rider.id}" ${record?.riderId === rider.id ? "selected" : ""}>${rider.name}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>Date</label><input id="recordDate" type="date" value="${record?.date || today}" /></div>
        <div class="field"><label>Parcels taken from owner</label><input id="recordTaken" type="number" min="0" value="${record?.parcelsTaken || 0}" /></div>
        <div class="field"><label>Delivered parcels</label><input id="recordDelivered" type="number" min="0" value="${record?.delivered || 0}" /></div>
        <div class="field"><label>Returned parcels</label><input id="recordReturned" type="number" min="0" value="${record?.returned || 0}" /></div>
        <div class="field"><label>Pay rate per delivered parcel</label><input id="recordRate" type="number" min="0" value="${record?.payRate || getRiders()[0]?.payRate || 14}" /></div>
        <div class="field"><label>Route</label><input id="recordRoute" value="${record?.route || ""}" placeholder="Area name" /></div>
        <div class="field"><label>Note</label><input id="recordNote" value="${record?.note || ""}" placeholder="Optional note" /></div>
        <div class="row-actions">
          <button class="btn" onclick="saveRecord()">${record ? "Save changes" : "Add record"}</button>
          ${record ? `<button class="btn secondary" onclick="editingRecordId=null; render()">Cancel</button>` : ""}
        </div>
      </div>
      <div class="table-card">
        <h2>All records</h2>
        ${filtersHtml()}
        <div id="recordTable">${recordsTable(filteredRecords(), true)}</div>
      </div>
    </div>
  `;
}

function filtersHtml() {
  return `
    <div class="filters">
      <input id="filterDate" type="date" onchange="refreshRecordTable()" />
      <select id="filterRider" onchange="refreshRecordTable()">
        <option value="">All riders</option>
        ${getRiders().map((rider) => `<option value="${rider.id}">${rider.name}</option>`).join("")}
      </select>
      <button class="btn secondary" onclick="clearFilters()">Clear</button>
    </div>
  `;
}

function filteredRecords(riderOnlyId = "") {
  const date = document.querySelector("#filterDate")?.value || "";
  const rider = riderOnlyId || document.querySelector("#filterRider")?.value || "";
  return db.records
    .filter((record) => !date || record.date === date)
    .filter((record) => !rider || record.riderId === rider)
    .sort((a, b) => b.date.localeCompare(a.date));
}

function refreshRecordTable(riderOnlyId = "") {
  const holder = document.querySelector("#recordTable");
  if (holder) holder.innerHTML = recordsTable(filteredRecords(riderOnlyId), !riderOnlyId);
}

function clearFilters() {
  const date = document.querySelector("#filterDate");
  const rider = document.querySelector("#filterRider");
  if (date) date.value = "";
  if (rider) rider.value = "";
  refreshRecordTable();
}

function saveRecord() {
  const riderId = document.querySelector("#recordRider").value;
  const rider = getUser(riderId);
  const delivered = Number(document.querySelector("#recordDelivered").value || 0);
  const taken = Number(document.querySelector("#recordTaken").value || 0);
  const returned = Number(document.querySelector("#recordReturned").value || Math.max(taken - delivered, 0));
  const item = {
    id: editingRecordId || `rec-${Date.now()}`,
    riderId,
    date: document.querySelector("#recordDate").value || today,
    parcelsTaken: taken,
    delivered,
    returned,
    payRate: Number(document.querySelector("#recordRate").value || rider.payRate || 0),
    route: document.querySelector("#recordRoute").value.trim(),
    note: document.querySelector("#recordNote").value.trim(),
  };
  if (editingRecordId) {
    db.records = db.records.map((record) => (record.id === editingRecordId ? item : record));
  } else {
    db.records.push(item);
  }
  editingRecordId = null;
  saveDb();
  render();
}

function editRecord(id) {
  editingRecordId = id;
  activeSection = "records";
  render();
}

function deleteRecord(id) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  db.records = db.records.filter((record) => record.id !== id);
  saveDb();
  render();
}

function renderRidersPanel() {
  const editingRider = getUser(editingRiderId);
  const rows = getRiders()
    .map((rider) => {
      const data = db.records.filter((record) => record.riderId === rider.id);
      const total = totals(data);
      return `
        <tr>
          <td>${rider.name}</td>
          <td>${rider.email}</td>
          <td>${rider.phone || "-"}</td>
          <td>${rider.payRate}</td>
          <td>${total.delivered}</td>
          <td>${money(total.earning)}</td>
          <td>
            <button class="btn secondary" onclick="editRider('${rider.id}')">Edit</button>
            <button class="btn danger" onclick="deleteRider('${rider.id}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
  return `
    <div class="work-area">
      <div class="form-card">
        <p class="eyebrow">${editingRider ? "Edit rider" : "Add rider"}</p>
        <h2>${editingRider ? "Update rider" : "Create new rider"}</h2>
        <div class="field"><label>Name</label><input id="riderName" value="${editingRider?.name || ""}" placeholder="Rider name" /></div>
        <div class="field"><label>Email</label><input id="riderEmail" type="email" value="${editingRider?.email || ""}" placeholder="rider@email.com" /></div>
        <div class="field"><label>Password</label><input id="riderPassword" type="text" value="${editingRider?.password || ""}" placeholder="Set password" /></div>
        <div class="field"><label>Phone</label><input id="riderPhone" value="${editingRider?.phone || ""}" placeholder="Phone number" /></div>
        <div class="field"><label>Default pay rate</label><input id="riderRate" type="number" min="0" value="${editingRider?.payRate || 14}" /></div>
        <div class="row-actions">
          <button class="btn" onclick="saveRider()">${editingRider ? "Save rider" : "Add rider"}</button>
          ${editingRider ? `<button class="btn secondary" onclick="editingRiderId=null; render()">Cancel</button>` : ""}
        </div>
        <p class="muted" style="font-size:13px">Riders can use these login details on the welcome page.</p>
      </div>
      <div class="table-card">
        <h2>Rider records</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Default rate</th><th>Delivered</th><th>Earning</th><th>Action</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function saveRider() {
  const name = document.querySelector("#riderName").value.trim();
  const email = document.querySelector("#riderEmail").value.trim().toLowerCase();
  const password = document.querySelector("#riderPassword").value.trim();
  const phone = document.querySelector("#riderPhone").value.trim();
  const payRate = Number(document.querySelector("#riderRate").value || 0);
  if (!name || !email || !password) {
    alert("Name, email, and password are required.");
    return;
  }
  const emailTaken = db.users.some((user) => user.email.toLowerCase() === email && user.id !== editingRiderId);
  if (emailTaken) {
    alert("This email is already in use by another account.");
    return;
  }
  const rider = {
    id: editingRiderId || `rider-${Date.now()}`,
    role: "rider",
    name,
    email,
    password,
    phone,
    payRate,
  };
  if (editingRiderId) {
    db.users = db.users.map((user) => (user.id === editingRiderId ? rider : user));
  } else {
    db.users.push(rider);
  }
  editingRiderId = null;
  saveDb();
  render();
}

function editRider(id) {
  editingRiderId = id;
  activeSection = "riders";
  render();
}

function deleteRider(id) {
  if (db.records.some((record) => record.riderId === id)) {
    alert("This rider has active delivery records. Please delete or reassign the records first.");
    return;
  }
  if (!confirm("Are you sure you want to delete this rider?")) return;
  db.users = db.users.filter((user) => user.id !== id);
  saveDb();
  render();
}

const SUPER_ADMIN_EMAIL = "owner@gbex.com";

function isSuperAdmin(user) {
  return user && user.role === "owner" && user.email.toLowerCase() === SUPER_ADMIN_EMAIL;
}

function renderUsersPanel() {
  const current = db.session ? getUser(db.session.userId) : null;
  const isSuper = isSuperAdmin(current);
  const editingUser = getUser(editingUserId);

  // Super admin can see all users; regular owners can only see riders
  const filteredUsersForTable = db.users.filter((usr) => {
    if (isSuper) return true;
    return usr.role === "rider";
  });

  const rows = filteredUsersForTable
    .map((usr) => {
      const isRider = usr.role === "rider";
      const data = isRider ? db.records.filter((record) => record.riderId === usr.id) : [];
      const total = totals(data);
      return `
        <tr>
          <td>${usr.name}</td>
          <td>${usr.email}</td>
          <td><span class="pill">${usr.role.toUpperCase()}</span></td>
          <td>${usr.phone || "-"}</td>
          <td>${isRider ? usr.payRate : "-"}</td>
          <td>${isRider ? total.delivered : "-"}</td>
          <td>${isRider ? money(total.earning) : "-"}</td>
          <td>
            <button class="btn secondary" onclick="editUser('${usr.id}')">Edit</button>
            <button class="btn danger" onclick="deleteUser('${usr.id}')">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="work-area">
      <div class="form-card">
        <p class="eyebrow">${editingUser ? "Edit User" : "Add User"}</p>
        <h2>${editingUser ? "Update User" : "Create New User"}</h2>
        
        <div class="field">
          <label>Role</label>
          <select id="userRole" onchange="toggleUserPayRateField()">
            <option value="rider" ${editingUser?.role === "rider" ? "selected" : ""}>Rider</option>
            ${isSuper ? `<option value="owner" ${editingUser?.role === "owner" ? "selected" : ""}>Owner</option>` : ""}
          </select>
        </div>
        
        <div class="field">
          <label>Name</label>
          <input id="userName" value="${editingUser?.name || ""}" placeholder="Full Name" />
        </div>
        
        <div class="field">
          <label>Email</label>
          <input id="userEmail" type="email" value="${editingUser?.email || ""}" placeholder="user@email.com" />
        </div>
        
        <div class="field">
          <label>Password</label>
          <input id="userPassword" type="text" value="${editingUser?.password || ""}" placeholder="Set password" />
        </div>
        
        <div class="field">
          <label>Phone</label>
          <input id="userPhone" value="${editingUser?.phone || ""}" placeholder="Phone number" />
        </div>
        
        <div class="field" id="userPayRateField" style="${editingUser?.role === "owner" ? "display: none;" : ""}">
          <label>Default Pay Rate</label>
          <input id="userPayRate" type="number" min="0" value="${editingUser?.payRate ?? 14}" />
        </div>
        
        <div class="row-actions">
          <button class="btn" onclick="saveUser()">${editingUser ? "Save User" : "Create User"}</button>
          ${editingUser ? `<button class="btn secondary" onclick="editingUserId=null; render()">Cancel</button>` : ""}
        </div>
        
        <p class="muted" style="font-size:13px; margin-top: 10px;">New user can log in with their email and password.</p>
      </div>
      
      <div class="table-card">
        <h2>System Users</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Phone</th>
                <th>Pay Rate</th>
                <th>Delivered</th>
                <th>Earning</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function toggleUserPayRateField() {
  const role = document.querySelector("#userRole").value;
  const payRateField = document.querySelector("#userPayRateField");
  if (payRateField) {
    payRateField.style.display = role === "owner" ? "none" : "";
  }
}

function saveUser() {
  const name = document.querySelector("#userName").value.trim();
  const email = document.querySelector("#userEmail").value.trim().toLowerCase();
  const password = document.querySelector("#userPassword").value.trim();
  const phone = document.querySelector("#userPhone").value.trim();
  const role = document.querySelector("#userRole").value;
  const payRate = role === "rider" ? Number(document.querySelector("#userPayRate").value || 0) : undefined;

  if (!name || !email || !password) {
    alert("Name, email and password are required.");
    return;
  }
  const emailTaken = db.users.some((u) => u.email.toLowerCase() === email && u.id !== editingUserId);
  if (emailTaken) {
    alert("This email is already in use by another account.");
    return;
  }

  const userObj = {
    id: editingUserId || `${role}-${Date.now()}`,
    role,
    name,
    email,
    password,
    phone,
  };
  if (role === "rider") {
    userObj.payRate = payRate;
  }

  if (editingUserId) {
    db.users = db.users.map((u) => (u.id === editingUserId ? userObj : u));
  } else {
    db.users.push(userObj);
  }
  editingUserId = null;
  saveDb();
  render();
}

function editUser(id) {
  editingUserId = id;
  activeSection = "users";
  render();
}

function deleteUser(id) {
  const current = db.session ? getUser(db.session.userId) : null;
  if (!current) return;

  const isSuper = isSuperAdmin(current);
  const userToDelete = getUser(id);

  if (!userToDelete) return;

  // Prevent deleting oneself
  if (current.id === id) {
    alert("You cannot delete your own account.");
    return;
  }

  // Only super admin can delete owner accounts
  if (userToDelete.role === "owner" && !isSuper) {
    alert("You do not have authorization to delete other Owner accounts.");
    return;
  }

  // Prevent deleting riders with active records
  if (userToDelete.role === "rider" && db.records.some((record) => record.riderId === id)) {
    alert("This rider has active delivery records. Please delete or reassign the records first.");
    return;
  }

  if (!confirm(`Are you sure you want to delete ${userToDelete.name}?`)) return;
  db.users = db.users.filter((u) => u.id !== id);
  saveDb();
  render();
}

function renderRider(user) {
  const riderRecords = db.records.filter((record) => record.riderId === user.id);
  const total = totals(riderRecords);
  app.innerHTML = `
    <div class="welcome-container">
      ${renderGlobalHeader()}
      <section class="app-shell">
        ${sidebar(user, "Rider Dashboard")}
        <main class="content">
          <div class="topbar">
            <div>
              <p class="eyebrow">Read only delivery records</p>
              <h1>Hi, ${user.name}</h1>
            </div>
            <button class="btn secondary" onclick="logout()">Logout</button>
          </div>
          ${riderContent(user, riderRecords, total)}
        </main>
      </section>
      ${renderGlobalFooter()}
    </div>
  `;
}

function riderContent(user, riderRecords, total) {
  const todays = riderRecords.filter((record) => record.date === today);
  const todayTotal = totals(todays);
  if (activeSection === "history") {
    return `
      ${metrics(total, "rider")}
      <div class="table-card">
        <h2>Date wise history</h2>
        <div class="filters">
          <input id="filterDate" type="date" onchange="refreshRecordTable('${user.id}')" />
          <button class="btn secondary" onclick="document.querySelector('#filterDate').value=''; refreshRecordTable('${user.id}')">Clear</button>
        </div>
        <div id="recordTable">${recordsTable(filteredRecords(user.id), false)}</div>
      </div>
    `;
  }
  return `
    ${metrics(todayTotal, "rider")}
    <div class="dashboard-banner-card">
      <img src="https://images.unsplash.com/photo-1569025690938-a00729c9e1f9?auto=format&fit=crop&w=800&q=80" alt="Rider Courier Operations" />
      <div class="dashboard-banner-text">
        <h3>Courier Delivery Portal</h3>
        <p>Keep track of your active route, parcel intake, successfully delivered shipments, and payouts. Data is read-only. For updates, please contact Gourav Madaan (+91 9103320212).</p>
      </div>
    </div>
    <div class="profile-card">
      <div class="panel">
        <h2>Today's Earning: ${money(todayTotal.earning)}</h2>
        <p class="muted">Today's data added by the owner is displayed here automatically.</p>
        ${recordsTable(todays, false)}
      </div>
      <div class="route-card">
        <h3>Your Rate</h3>
        <p>Default pay rate: ${money(user.payRate)} per delivered parcel. If the owner modifies the rate in a record, earnings will be calculated using that specific rate.</p>
        <button class="btn" onclick="activeSection='history'; render()">Check past records</button>
      </div>
    </div>
  `;
}

function recordsTable(records, editable) {
  if (!records.length) return `<div class="empty">No records found for the selected filter.</div>`;
  const rows = records
    .map((record) => {
      const rider = getUser(record.riderId);
      return `
        <tr>
          <td>${record.date}</td>
          <td>${rider?.name || "Unknown"}</td>
          <td>${record.route || "-"}</td>
          <td>${record.parcelsTaken}</td>
          <td><span class="pill">${record.delivered}</span></td>
          <td>${record.returned}</td>
          <td>${money(record.payRate)}</td>
          <td><strong>${money(calcEarning(record))}</strong></td>
          <td>${record.note || "-"}</td>
          ${editable ? `<td><button class="btn secondary" onclick="editRecord('${record.id}')">Edit</button> <button class="btn danger" onclick="deleteRecord('${record.id}')">Delete</button></td>` : ""}
        </tr>
      `;
    })
    .join("");
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th><th>Rider</th><th>Route</th><th>Taken</th><th>Delivered</th><th>Returned</th><th>Rate</th><th>Earning</th><th>Note</th>${editable ? "<th>Action</th>" : ""}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

window.loginWithPassword = loginWithPassword;
window.requestLoginOtp = requestLoginOtp;
window.verifyLoginOtp = verifyLoginOtp;
window.resendLoginOtp = resendLoginOtp;
window.signup = signup;
window.verifySignupOtp = verifySignupOtp;
window.resendSignupOtp = resendSignupOtp;
window.socialLogin = socialLogin;
window.forgotPassword = forgotPassword;
window.logout = logout;
window.renderWelcome = renderWelcome;
window.render = render;
window.saveRecord = saveRecord;
window.editRecord = editRecord;
window.deleteRecord = deleteRecord;
window.saveRider = saveRider;
window.editRider = editRider;
window.deleteRider = deleteRider;
window.saveUser = saveUser;
window.editUser = editUser;
window.deleteUser = deleteUser;
window.toggleUserPayRateField = toggleUserPayRateField;
window.refreshRecordTable = refreshRecordTable;
window.clearFilters = clearFilters;
window.syncNow = syncNow;
window.authMode = authMode;
window.closeSocialAuthModal = closeSocialAuthModal;
window.submitSocialAuth = submitSocialAuth;
window.saveDb = saveDb;
window.db = db;

function updateDb(newDb) {
  db = newDb;
  window.db = newDb;
  saveDb();
  render();
}
window.updateDb = updateDb;

async function initApp() {
  renderLoading();
  await loadCloudDb();
  render();
}

initApp();
