const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycbyJ8GOxtkVMDoDY6Mx3t6H-89yJltE7uNLipILnL5XKCLtK0YcJ3u9YYtO9TW3-1j2y/exec";

document.addEventListener("DOMContentLoaded", () => {
  const syncBtn = document.getElementById("syncBtn");
  const statusBox = document.getElementById("statusBox");

  function showStatus(text, type) {
    statusBox.textContent = text;
    statusBox.className = `status ${type}`;
  }

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    showStatus("Connecting to page...", "info");

    try {
      // 1. Get active tab (Ekart tab)
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!activeTab) {
        showStatus("No active tab found.", "error");
        syncBtn.disabled = false;
        return;
      }

      if (!activeTab.url || (!activeTab.url.includes("partner.ekartlogistics.com") && !activeTab.url.includes("localhost:8085"))) {
        showStatus("Please go to the active jobsheet page.", "error");
        syncBtn.disabled = false;
        return;
      }

      // 2. Find open GBEX Dashboard tab (precise match by title and non-admin URL)
      const allTabs = await chrome.tabs.query({});
      console.log("Detected tabs:", allTabs.map(t => ({ id: t.id, url: t.url, title: t.title })));

      const dashboardTab = allTabs.find(t => {
        const url = t.url || "";
        const title = t.title || "";
        const isMock = url.includes("mock-ekart");
        const isNetlifyAdmin = url.includes("app.netlify.com");
        const isGoogleSheets = url.includes("docs.google.com");
        
        if (isMock || isNetlifyAdmin || isGoogleSheets) return false;
        
        // Exact matching for live app or local server
        const hasDashboardTitle = title.includes("Global Business Express") || title === "GBEX";
        const hasDashboardUrl = url.includes("localhost") || url.includes("127.0.0.1") || url.includes(".netlify.app");
        
        return hasDashboardTitle || hasDashboardUrl;
      });

      if (!dashboardTab) {
        showStatus("Error: GBEX Dashboard tab must be open. Please keep it open and try again.", "error");
        syncBtn.disabled = false;
        return;
      }

      showStatus("Reading page data...", "info");

      // 3. Send message to content script to get scraped table
      chrome.tabs.sendMessage(activeTab.id, { action: "scrapeData" }, async (scrapeRes) => {
        if (chrome.runtime.lastError) {
          showStatus("Error: Tab communication failed. Please refresh the page.", "error");
          syncBtn.disabled = false;
          return;
        }

        if (!scrapeRes || !scrapeRes.success) {
          showStatus(scrapeRes?.error || "Failed to read page data.", "error");
          syncBtn.disabled = false;
          return;
        }

        const scrapedRecords = scrapeRes.data;
        if (!scrapedRecords || scrapedRecords.length === 0) {
          showStatus("No active jobsheet rows found on the page.", "error");
          syncBtn.disabled = false;
          return;
        }

        showStatus("Loading database from Dashboard tab...", "info");

        // 4. Read database from Dashboard tab localStorage
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId: dashboardTab.id },
            func: () => {
              return localStorage.getItem("gbex-logistics-db") || localStorage.getItem("gmk-logistics-db");
            }
          });

          const dbText = results?.[0]?.result;
          if (!dbText) {
            showStatus("Failed to read database from GBEX Dashboard tab. Please refresh the Dashboard tab and try again.", "error");
            syncBtn.disabled = false;
            return;
          }

          const db = JSON.parse(dbText);
          if (!db || !Array.isArray(db.users) || !Array.isArray(db.records)) {
            showStatus("Database check error: invalid schema in dashboard tab.", "error");
            syncBtn.disabled = false;
            return;
          }

          showStatus("Processing & Syncing updates...", "info");

          const todayStr = new Date().toISOString().slice(0, 10);
          let newUsersAdded = 0;
          let recordsUpdated = 0;

          scrapedRecords.forEach((item) => {
            const cleanScrapedName = item.riderName.trim();
            if (!cleanScrapedName) return;

            // Find matching rider
            let matchedRider = db.users.find(u => 
              u.role === "rider" && (
                u.name.toLowerCase().includes(cleanScrapedName.toLowerCase()) ||
                cleanScrapedName.toLowerCase().includes(u.name.toLowerCase())
              )
            );

            // Auto-register rider if not found
            if (!matchedRider) {
              matchedRider = {
                id: `rider-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                role: "rider",
                name: cleanScrapedName,
                email: `${cleanScrapedName.replace(/\s+/g, "").toLowerCase()}@ekart.com`,
                password: "EkartRider@123",
                phone: item.phone || "",
                payRate: 14
              };
              db.users.push(matchedRider);
              newUsersAdded++;
            } else {
              // Update phone number if missing
              if (item.phone && !matchedRider.phone) {
                matchedRider.phone = item.phone;
              }
            }

            // Normalise date
            let recDate = item.date ? normalizeDate(item.date) : todayStr;
            if (!recDate) recDate = todayStr;

            const recId = `rec-ekart-${item.jobsheetId}`;
            // Use dynamically scraped values if present, else default to 0
            const parcelsTaken = typeof item.totalShipments !== 'undefined' ? Number(item.totalShipments) : 0;
            const delivered = typeof item.delivered !== 'undefined' ? Number(item.delivered) : 0;
            const returned = typeof item.returned !== 'undefined' ? Number(item.returned) : 0;

            const newRecord = {
              id: recId,
              riderId: matchedRider.id,
              date: recDate,
              parcelsTaken,
              delivered,
              returned,
              payRate: matchedRider.payRate || 14,
              route: item.route || "Ekart Route",
              note: `Synced from Ekart (Sheet ID: ${item.jobsheetId})`
            };

            // Merge
            const existingIdx = db.records.findIndex(r => r.id === recId);
            if (existingIdx > -1) {
              db.records[existingIdx] = { 
                ...newRecord, 
                parcelsTaken: typeof item.totalShipments !== 'undefined' ? parcelsTaken : (db.records[existingIdx].parcelsTaken || 0),
                delivered: typeof item.delivered !== 'undefined' ? delivered : (db.records[existingIdx].delivered || 0),
                returned: typeof item.returned !== 'undefined' ? returned : (db.records[existingIdx].returned || 0),
                route: db.records[existingIdx].route !== "Ekart Route" ? db.records[existingIdx].route : newRecord.route,
                note: db.records[existingIdx].note || newRecord.note
              };
            } else {
              db.records.push(newRecord);
            }
            recordsUpdated++;
          });

          showStatus("Writing back to Dashboard & Syncing Sheet...", "info");

          // 5. Write back database and trigger save/render in Dashboard tab context
          await chrome.scripting.executeScript({
            target: { tabId: dashboardTab.id },
            args: [db],
            func: (updatedDb) => {
              localStorage.setItem("gbex-logistics-db", JSON.stringify(updatedDb));
              if (typeof window.updateDb === 'function') {
                window.updateDb(updatedDb);
              } else {
                if (typeof window.db !== 'undefined') window.db = updatedDb;
                if (typeof window.saveDb === 'function') window.saveDb();
                if (typeof window.render === 'function') window.render();
              }
              return true;
            }
          });

          showStatus(`Success! Synced ${recordsUpdated} records. Added ${newUsersAdded} new riders.`, "success");
          syncBtn.disabled = false;

        } catch (dbErr) {
          showStatus(`Database error: ${dbErr.message}`, "error");
          syncBtn.disabled = false;
        }
      });

    } catch (err) {
      showStatus(`Unexpected error: ${err.message}`, "error");
      syncBtn.disabled = false;
    }
  });
});

const MONTHS_MAP = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
};

function normalizeDate(dateStr) {
  if (!dateStr) return "";
  const datePart = dateStr.split(",")[0].trim();
  const partsText = datePart.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})\s+(\d{4})/);
  if (partsText) {
    const day = partsText[1].padStart(2, '0');
    const monthName = partsText[2].toLowerCase().substring(0, 3);
    const year = partsText[3];
    const month = MONTHS_MAP[monthName] || "01";
    return `${year}-${month}-${day}`;
  }
  const partsISO = dateStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (partsISO) {
    return `${partsISO[1]}-${partsISO[2].padStart(2, '0')}-${partsISO[3].padStart(2, '0')}`;
  }
  return "";
}
