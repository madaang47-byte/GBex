# GBEX Real Login Setup

## 1. Firebase project

1. Go to Firebase Console.
2. Create project: `GBEX`.
3. Add a Web App.
4. Copy the Firebase config.

## 2. Enable login providers

Firebase Console > Authentication > Sign-in method:

- Enable Email/Password.
- Enable Google.
- Enable Apple only after Apple Developer setup is ready.

## 3. Authorized domains

Firebase Console > Authentication > Settings > Authorized domains:

- Add your Cloudflare domain.
- For local test, keep `localhost`.

## 4. Paste config

Open `firebase-config.js` and replace empty values:

```js
window.GBEX_FIREBASE_CONFIG = {
  enabled: true,
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID",
};
```

## 5. Owner account

Create the owner in Firebase Authentication with:

```text
owner@gbex.com
Owner@123
```

The owner email must also exist in the website/Sheet `Users` tab with role `owner`.

## Important

Google login works after enabling Google provider.

Apple login also needs Apple Developer account, Services ID, private key, Team ID, and Firebase Apple provider configuration.
