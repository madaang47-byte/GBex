# Real Google Sign-In Setup Guide

To enable real Google popup sign-in for your dashboard:

## 1. Get Google OAuth Client ID (100% Free)

1. Open the [Google Cloud Console Credentials Page](https://console.cloud.google.com/apis/credentials).
2. Click **Create Project** (if you don't have one). Give it a name like `GBEX`.
3. In the left menu, click **OAuth consent screen**:
   - Select **External** (or Internal if you use Google Workspace) and click **Create**.
   - Enter your App name (`GBEX`), User support email, and Developer contact information.
   - Click **Save and Continue** on the Scopes and Test Users screens.
4. Click **Credentials** in the left menu.
5. Click **+ Create Credentials** at the top and select **OAuth client ID**.
6. Set the settings:
   - **Application type**: Web application.
   - **Name**: `GBEX Web App`.
   - **Authorized JavaScript origins**:
     - Click **+ Add URI** and paste your local testing URL: `http://localhost:8085`
     - Click **+ Add URI** and paste your live Netlify URL: `https://gbex1.netlify.app`
   - **Authorized redirect URIs**:
     - Click **+ Add URI** and paste: `http://localhost:8085`
     - Click **+ Add URI** and paste: `https://gbex1.netlify.app`
7. Click **Create**.
8. Copy the **Client ID** that is generated (it looks like `xxxxxxxx-xxxxxxxx.apps.googleusercontent.com`).

---

## 2. Configure Client ID in Website

Open `config.js` in your website code and paste your copied Client ID:

```javascript
window.GMK_CONFIG = {
  googleSheetApiUrl: "https://script.google.com/macros/s/...",
  googleClientId: "YOUR_COPIED_CLIENT_ID_HERE.apps.googleusercontent.com"
};
```

Commit the code and push it to GitHub. Once Netlify deploys, click **Continue with Google** to sign in with your real Google account!
