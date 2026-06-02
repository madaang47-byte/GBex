const SHEET_ID = "1Jiu666NgXhu1rgIskKWM_vpNXWuh7zWSIq-9_X91YEg";

const USER_HEADERS = ["id", "role", "name", "email", "password", "phone", "payRate"];
const RECORD_HEADERS = ["id", "riderId", "date", "parcelsTaken", "delivered", "returned", "payRate", "route", "note"];

function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  getOrCreateSheet_(ss, "Users", USER_HEADERS);
  getOrCreateSheet_(ss, "Records", RECORD_HEADERS);
}

function doGet() {
  return jsonResponse(readDatabase_());
}

function doPost(event) {
  const rawBody = event.parameter && event.parameter.payload
    ? event.parameter.payload
    : event.postData && event.postData.contents
      ? event.postData.contents
      : "{}";
  const body = JSON.parse(rawBody);
  if (body.action === "save") {
    writeDatabase_(body.data || {});
    return jsonResponse({ ok: true, data: readDatabase_() });
  }
  return jsonResponse({ ok: false, error: "Unknown action" });
}

function readDatabase_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  return {
    users: sheetToObjects_(getOrCreateSheet_(ss, "Users", USER_HEADERS)),
    records: sheetToObjects_(getOrCreateSheet_(ss, "Records", RECORD_HEADERS)),
  };
}

function writeDatabase_(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  objectsToSheet_(getOrCreateSheet_(ss, "Users", USER_HEADERS), USER_HEADERS, data.users || []);
  objectsToSheet_(getOrCreateSheet_(ss, "Records", RECORD_HEADERS), RECORD_HEADERS, data.records || []);
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (currentHeaders.join("") === "") {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      item[header] = row[index];
    });
    return item;
  });
}

function objectsToSheet_(sheet, headers, rows) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!rows.length) return;
  const values = rows.map((item) => headers.map((header) => item[header] ?? ""));
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
