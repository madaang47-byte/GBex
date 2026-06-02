import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const config = window.GBEX_FIREBASE_CONFIG || {};
const configured = Boolean(config.enabled && config.apiKey && config.authDomain && config.projectId && config.appId);

let auth = null;
if (configured) {
  const app = initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    appId: config.appId,
  });
  auth = getAuth(app);
}

function requireAuth() {
  if (!auth) {
    throw new Error("Firebase Auth is not configured yet.");
  }
  return auth;
}

window.GBEX_AUTH = {
  configured,
  async signInEmail(email, password) {
    const result = await signInWithEmailAndPassword(requireAuth(), email, password);
    return result.user;
  },
  async signupEmail(email, password) {
    const result = await createUserWithEmailAndPassword(requireAuth(), email, password);
    return result.user;
  },
  async signInProvider(providerName) {
    const provider = providerName === "Apple ID"
      ? new OAuthProvider("apple.com")
      : new GoogleAuthProvider();
    const result = await signInWithPopup(requireAuth(), provider);
    return result.user;
  },
  async resetPassword(email) {
    await sendPasswordResetEmail(requireAuth(), email);
  },
  async signOutUser() {
    await signOut(requireAuth());
  },
};
