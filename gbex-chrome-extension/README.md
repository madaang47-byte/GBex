# GBEX Ekart Jobsheet Sync - Chrome Extension

Yeh extension aapke **Ekart Logistics partner portal** se active jobsheets ko scrape karke automatically aapke GBEX dashboard (Google Sheets) par sync kar deta hai.

## 🛠️ Google Chrome me kaise load karein (Installation):

1. **Google Chrome** browser open karein.
2. Address bar me `chrome://extensions/` type karke Enter karein (ya Chrome Menu -> Extensions -> Manage Extensions par jayein).
3. Right side top corner me **"Developer mode"** toggle ko **ON** karein.
4. Left side me **"Load unpacked"** button par click karein.
5. Is project ke andar jo `gbex-chrome-extension` folder hai, use select karein.
6. Extension load ho jayegi aur aapke Chrome toolbar me icon show hone lagega (Aap ise pin kar sakte hain).

## 🚀 Sync Kaise Karein (Usage):

1. **Ekart Logistics Partner Portal** par log in karein.
2. Is page par jayein: `https://partner.ekartlogistics.com/pcm/track/jobsheet/active`
3. Jab active jobsheets ki table screen par load ho jaye, to Chrome toolbar me **GBEX Ekart Sync** extension par click karein.
4. **"Sync Active Jobsheets"** button par click karein.
5. Ye extension automatically:
   - Table se jobsheet details copy karega.
   - Naye riders ko auto-register karega.
   - Data ko merge karke aapke Google Sheets database par secure save kar dega!
