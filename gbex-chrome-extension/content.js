chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrapeData") {
    try {
      const data = scrapeTableData();
      sendResponse({ success: true, data: data });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true; // Keep channel open
  }
});

// Main routing scraper
function scrapeTableData() {
  if (window.location.href.includes("view-runsheet")) {
    return scrapeRunsheetDetailPage();
  } else {
    return scrapeActiveJobsheetsPage();
  }
}

// Scrapes the Runsheet Detail page (e.g. /pcm/view-runsheet/*)
function scrapeRunsheetDetailPage() {
  // 1. Extract Sheet ID
  const sheetMatch = document.body.innerText.match(/Sheet ID\s*-\s*(\d+)/i);
  const jobsheetId = sheetMatch ? sheetMatch[1] : "";

  // 2. Extract Assigned Agent (Rider Name)
  let riderName = "";
  const agentMatch = document.body.innerText.match(/Assigned Agent\s*[\r\n]+([^\r\n]+)/i) ||
                     document.body.innerText.match(/Assigned Agent\s*:\s*([^\r\n]+)/i);
  if (agentMatch) {
    riderName = agentMatch[1].trim();
  } else {
    const agentHeader = Array.from(document.querySelectorAll("*")).find(el => el.textContent.trim() === "Assigned Agent");
    if (agentHeader && agentHeader.parentElement) {
      riderName = agentHeader.parentElement.textContent.replace("Assigned Agent", "").trim();
    }
  }

  // 3. Extract Total Shipments
  const countMatch = document.body.innerText.match(/(\d+)\s*:\s*Number of Shipments/i) ||
                     document.body.innerText.match(/Number of Shipments\s*:\s*(\d+)/i);
  const totalShipments = countMatch ? Number(countMatch[1]) : 0;

  if (!jobsheetId || !riderName) return [];

  // 4. Count delivered/returned from table
  let delivered = 0;
  let returned = 0;
  const table = document.querySelector("table");
  if (table) {
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length > 0) {
        const statusCell = cells[cells.length - 1];
        if (statusCell) {
          const status = statusCell.textContent.trim().toUpperCase();
          if (status === "DELIVERED" || status === "SUCCESS") {
            delivered++;
          } else if (status === "RETURNED" || status === "FAILED" || status === "UNDELIVERED" || status === "RTO") {
            returned++;
          }
        }
      }
    });
  }

  const dateText = new Date().toISOString().slice(0, 10);

  return [{
    jobsheetId,
    riderName,
    phone: "",
    date: dateText,
    totalShipments,
    delivered,
    returned
  }];
}

// Scrapes the Active Jobsheets page (e.g. /pcm/track/jobsheet/active)
function scrapeActiveJobsheetsPage() {
  const table = document.querySelector("table");
  if (!table) return [];

  // Get headers in lowercase
  const headers = Array.from(table.querySelectorAll("thead th, tr:first-child th, tr:first-child td")).map(th => th.textContent.trim().toLowerCase());
  const rows = Array.from(table.querySelectorAll("tbody tr"));

  // Check headers indexes matching the screenshot columns
  let indexes = {
    jobsheetId: headers.findIndex(h => h.includes("sheet id") || h.includes("jobsheet") || h.includes("id")),
    riderName: headers.findIndex(h => h.includes("pce id") || h.includes("rider") || h.includes("name") || h.includes("agent")),
    phone: headers.findIndex(h => h.includes("contact") || h.includes("phone")),
    date: headers.findIndex(h => h.includes("last edited") || h.includes("date"))
  };

  // Fallbacks based on typical index positions in the screenshot
  if (indexes.jobsheetId === -1) indexes.jobsheetId = 3; // Sheet ID
  if (indexes.riderName === -1) indexes.riderName = 2;   // PCE ID
  if (indexes.phone === -1) indexes.phone = 5;           // Contact
  if (indexes.date === -1) indexes.date = 6;             // Last Edited

  const records = [];

  rows.forEach((row) => {
    const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim());
    if (cells.length < Math.max(indexes.jobsheetId, indexes.riderName) + 1) return;

    // Get Jobsheet ID (Sheet ID column)
    const jobsheetId = cells[indexes.jobsheetId] || "";
    // Get Rider Name (PCE ID column)
    const riderName = cells[indexes.riderName] || "";
    // Get Rider Phone (Contact column)
    const phone = indexes.phone !== -1 ? cells[indexes.phone] : "";
    // Get Date (Last Edited column)
    const dateText = indexes.date !== -1 ? cells[indexes.date] : "";

    if (!jobsheetId || !riderName) return;

    records.push({
      jobsheetId,
      riderName,
      phone,
      date: dateText
    });
  });

  return records;
}
