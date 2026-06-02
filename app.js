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
  // Purge old demo riders and records from localStorage to clean the data
  data.users = (data.users || []).filter((user) => user.id !== "rider-1" && user.id !== "rider-2");
  data.records = (data.records || []).filter((record) => record.id !== "rec-1" && record.id !== "rec-2" && record.id !== "rec-3");

  data.users = (data.users || []).map((user) => {
    const next = { ...user };
    if (next.role === "owner" && (next.email === "owner@gouravmk.com" || next.name === "Gourav MK")) {
      next.name = "GBEX Admin";
      next.email = "owner@gbex.com";
    }
    if (next.email === "rider@gouravmk.com") next.email = "rider@gbex.com";
    if (next.email === "aman@gouravmk.com") next.email = "aman@gbex.com";
    
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

function pushCloudDb() {
  if (!cloudEnabled()) return;
  const data = { users: db.users, records: db.records };
  submitCloudPayload({ action: "save", data });
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
  alert("Sync request Google Sheet ko bhej di gayi hai. Sheet refresh karke Users aur Records tabs check karein.");
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
    return "Email ya password galat hai.";
  }
  if (code.includes("popup-closed-by-user")) {
    return "Login popup band ho gaya. Dobara try karein.";
  }
  if (code.includes("email-already-in-use")) {
    return "Is email se account pehle se bana hua hai.";
  }
  if (code.includes("weak-password")) {
    return "Password kam se kam 6 characters ka hona chahiye.";
  }
  return "Login complete nahi hua. Firebase setup aur provider settings check karein.";
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

async function login(role) {
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;
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
    showNotice("Login detail match nahi hui. Role, email aur password check karein.");
    return;
  }
  db.session = { userId: user.id };
  saveDb();
  render();
}

async function signup() {
  const name = document.querySelector("#signupName").value.trim();
  const email = document.querySelector("#signupEmail").value.trim().toLowerCase();
  const password = document.querySelector("#signupPassword").value;
  if (!name || !email || !password) {
    showNotice("Naam, email aur password bharna zaroori hai.");
    return;
  }
  if (db.users.some((user) => user.email.toLowerCase() === email)) {
    showNotice("Is email se account pehle se bana hua hai.");
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

async function socialLogin(provider) {
  const role = authMode;
  if (firebaseReady()) {
    try {
      const authUser = await window.GBEX_AUTH.signInProvider(provider);
      await completeAuthLogin(authUser.email || "", role, authUser.displayName || "");
    } catch (error) {
      showNotice(authErrorMessage(error));
    }
    return;
  }
  const email = getLoginEmail(role, provider);
  let user = db.users.find((item) => item.email.toLowerCase() === email && item.role === role);

  if (!user && role === "rider") {
    user = {
      id: `rider-${Date.now()}`,
      role: "rider",
      name: provider === "Apple ID" ? "Apple Rider" : "Google Rider",
      email,
      password: provider === "Apple ID" ? "Apple@123" : "Google@123",
      phone: "",
      payRate: 14,
    };
    db.users.push(user);
  }

  if (!user && role === "owner") {
    // In demo mode, automatically log in as the default Owner (owner-1)
    user = db.users.find(u => u.role === "owner");
    if (!user) {
      user = {
        id: "owner-1",
        role: "owner",
        name: "GBEX Admin",
        email: "owner@gbex.com",
        password: "Owner@123",
      };
      db.users.push(user);
    }
  }

  db.session = { userId: user.id };
  saveDb();
  render();
}

async function forgotPassword() {
  const email = document.querySelector("#email")?.value.trim() || "aapki email";
  if (firebaseReady()) {
    try {
      await window.GBEX_AUTH.resetPassword(email);
      showNotice(`Password reset link ${email} par bhej diya gaya hai.`);
    } catch (error) {
      showNotice(authErrorMessage(error));
    }
    return;
  }
  showNotice(`Password reset link demo ke liye ${email} par bheja hua maan sakte hain.`);
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

function renderWelcome() {
  const authStatusText = firebaseReady() ? "Real Google, Apple and email login enabled." : "Firebase keys pending. Buttons run in demo mode.";
  app.innerHTML = `
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
            <div class="hero-stat"><strong>2</strong><span>Demo riders</span></div>
            <div class="hero-stat"><strong>₹25</strong><span>Sample pay rate</span></div>
            <div class="hero-stat"><strong>${today}</strong><span>Today view ready</span></div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-card">
          <p class="eyebrow">Secure login</p>
          <h2>Welcome back</h2>
          <p class="muted">Choose your role to continue. <span class="pill">${authStatusText}</span></p>
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
          <div class="auth-actions">
            <button class="btn full" onclick="login('${authMode}')">Login</button>
            <button class="link-btn" onclick="forgotPassword()">Forgot password?</button>
          </div>
          <div class="social-grid">
            <button class="btn line social-btn" onclick="socialLogin('Google')"><span class="social-icon google">G</span>Continue with Google</button>
            <button class="btn line social-btn" onclick="socialLogin('Apple ID')"><span class="social-icon apple">A</span>Continue with Apple</button>
          </div>
          <hr style="border:0;border-top:1px solid var(--line);margin:22px 0" />
          <p class="eyebrow">${authMode === "rider" ? "New rider" : "New owner"}</p>
          <div class="field"><label>Name</label><input id="signupName" placeholder="${authMode === "rider" ? "Rider name" : "Owner name"}" /></div>
          <div class="field"><label>Email</label><input id="signupEmail" type="email" placeholder="${authMode === "rider" ? "newrider@email.com" : "newowner@email.com"}" /></div>
          <div class="field"><label>Password</label><input id="signupPassword" type="password" placeholder="Create password" /></div>
          <button class="btn secondary full" onclick="signup()">${authMode === "rider" ? "Create rider account" : "Create owner account"}</button>
          <div id="notice" class="notice"></div>
        </div>
      </div>
    </section>
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
    <section class="app-shell">
      ${sidebar(user, "Owner Control")}
      <main class="content">
        <div class="topbar">
          <div>
            <p class="eyebrow">Private owner dashboard</p>
            <h1>GBEX</h1>
          </div>
          <div class="row-actions">
            <button class="btn" onclick="syncNow()">Sync to Google Sheet</button>
            <button class="btn secondary" onclick="logout()">Logout</button>
          </div>
        </div>
        ${ownerContent(total)}
      </main>
    </section>
  `;
}

function ownerContent(total) {
  if (activeSection === "users") return renderUsersPanel();
  if (activeSection === "riders") return renderRidersPanel();
  if (activeSection === "records") return renderOwnerRecords();
  return `
    ${metrics(total)}
    <div class="profile-card">
      <div class="panel">
        <h2>Today control</h2>
        <p class="muted">Date wise data add karein. System automatically rider totals aur earning calculate karta hai.</p>
        ${recordsTable(db.records.filter((record) => record.date === today), true)}
      </div>
      <div class="route-card">
        <h3>GBEX control</h3>
        <p>Rider dashboard read-only hai. Add, edit, delete aur pay-rate control sirf owner ke paas hai.</p>
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
  if (!confirm("Record delete karna hai?")) return;
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
        <p class="muted" style="font-size:13px">Ye login detail rider welcome page se use kar payega.</p>
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
    alert("Name, email aur password required hai.");
    return;
  }
  const emailTaken = db.users.some((user) => user.email.toLowerCase() === email && user.id !== editingRiderId);
  if (emailTaken) {
    alert("Is email se account already bana hua hai.");
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
    alert("Is rider ke records hain. Pehle records delete/change karein, phir rider delete hoga.");
    return;
  }
  if (!confirm("Rider delete karna hai?")) return;
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
    alert("Aap apne khud ke account ko delete nahi kar sakte.");
    return;
  }

  // Only super admin can delete owner accounts
  if (userToDelete.role === "owner" && !isSuper) {
    alert("Aapko dusre Owner accounts delete karne ki authority nahi hai.");
    return;
  }

  // Prevent deleting riders with active records
  if (userToDelete.role === "rider" && db.records.some((record) => record.riderId === id)) {
    alert("Is rider ke records hain. Pehle records delete/change karein, phir rider delete hoga.");
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
    <div class="profile-card">
      <div class="panel">
        <h2>Today earning: ${money(todayTotal.earning)}</h2>
        <p class="muted">Aaj owner ne jo data add kiya hai, wahi yahan automatic show ho raha hai.</p>
        ${recordsTable(todays, false)}
      </div>
      <div class="route-card">
        <h3>Your rate</h3>
        <p>Default pay rate: ${money(user.payRate)} per delivered parcel. Owner record mein rate change kare to earning usi rate se calculate hogi.</p>
        <button class="btn" onclick="activeSection='history'; render()">Check past records</button>
      </div>
    </div>
  `;
}

function recordsTable(records, editable) {
  if (!records.length) return `<div class="empty">Abhi is filter mein koi record nahi hai.</div>`;
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

window.login = login;
window.signup = signup;
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

async function initApp() {
  renderLoading();
  await loadCloudDb();
  render();
}

initApp();
