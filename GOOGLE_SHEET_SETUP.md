# GBEX Google Sheet Setup

## 1. Sheet ID

Google Sheet link me se ID copy karein:

```text
https://docs.google.com/spreadsheets/d/SHEET_ID_YAHAN_HOTA_HAI/edit
```

`google-sheet-backend.gs` file me:

```js
const SHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE";
```

ko apni Sheet ID se replace karein.

## 2. Apps Script deploy

1. Google Sheet open karein.
2. Extensions > Apps Script open karein.
3. `google-sheet-backend.gs` ka pura code paste karein.
4. Deploy > New deployment.
5. Type: Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Deploy karke Web app URL copy karein.

## 3. Website config

`config.js` me Web app URL paste karein:

```js
window.GMK_CONFIG = {
  googleSheetApiUrl: "PASTE_WEB_APP_URL_HERE",
};
```

Cloudflare Pages par deploy karne ke baad data Google Sheet se load/save hoga.

## Sheet tabs

Apps Script automatically 2 tabs bana dega:

- Users
- Records

Owner dashboard se riders aur records add/edit karoge to ye tabs update honge.
