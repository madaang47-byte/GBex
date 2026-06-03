const SHEET_ID = "1Jiu666NgXhu1rgIskKWM_vpNXWuh7zWSIq-9_X91YEg";

const USER_HEADERS = ["id", "role", "name", "email", "password", "phone", "payRate"];
const RECORD_HEADERS = ["id", "riderId", "date", "parcelsTaken", "delivered", "returned", "payRate", "route", "note"];
const OTP_HEADERS = ["email", "otp", "expiresAt"];

function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  getOrCreateSheet_(ss, "Users", USER_HEADERS);
  getOrCreateSheet_(ss, "Records", RECORD_HEADERS);
  getOrCreateSheet_(ss, "PendingOTPs", OTP_HEADERS);
}

function doGet(event) {
  const action = event && event.parameter && event.parameter.action;
  
  if (action === "requestOTP") {
    return handleRequestOTP(event.parameter.email, event.parameter.mode);
  }
  if (action === "verifyOTP") {
    return handleVerifyOTP(event.parameter.email, event.parameter.otp);
  }
  
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
  
  if (body.action === "requestOTP") {
    return handleRequestOTP(body.email, body.mode);
  }
  
  if (body.action === "verifyOTP") {
    return handleVerifyOTP(body.email, body.otp);
  }
  
  return jsonResponse({ ok: false, error: "Unknown action" });
}

function handleRequestOTP(email, mode) {
  if (!email) return jsonResponse({ ok: false, error: "Email is required" });
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const usersSheet = getOrCreateSheet_(ss, "Users", USER_HEADERS);
  const users = sheetToObjects_(usersSheet);
  
  // Check if email already exists in sheet database
  const exists = users.some(u => u.email.toLowerCase() === email.toLowerCase());
  if (mode === "login") {
    if (!exists) {
      return jsonResponse({ ok: false, error: "This email is not registered. Please sign up first." });
    }
  } else {
    // Default mode is signup (unregistered verification)
    if (exists) {
      return jsonResponse({ ok: false, error: "An account with this email is already registered." });
    }
  }
  
  // Generate 6-digit OTP code
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiration
  
  try {
    // Send email using Google's MailApp
    MailApp.sendEmail({
      to: email,
      subject: "GBEX Account Verification OTP Code",
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e3e3e3; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <span style="background: #dc001b; color: white; padding: 6px 14px; border-radius: 4px; font-weight: 900; font-size: 20px;">GBEX</span>
          </div>
          <h2 style="color: #1c1c1c; text-align: center;">Verify Your Account</h2>
          <p style="color: #666; font-size: 15px; line-height: 1.5; text-align: center;">Use the following One-Time Password (OTP) to verify your email and activate your account. This code is valid for 10 minutes.</p>
          <div style="text-align: center; margin: 25px 0;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 4px; color: #dc001b; background: #fdeaea; padding: 10px 20px; border-radius: 6px; border: 1px dashed #dc001b;">${otpCode}</span>
          </div>
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">If you did not request this code, please ignore this email.</p>
        </div>
      `
    });
  } catch (err) {
    return jsonResponse({ ok: false, error: "Failed to send email. Please enter a valid, active email address. Details: " + err.message });
  }
  
  // Store or update OTP in PendingOTPs sheet
  const otpSheet = getOrCreateSheet_(ss, "PendingOTPs", OTP_HEADERS);
  let otps = sheetToObjects_(otpSheet);
  
  // Remove any old entries for this email
  otps = otps.filter(o => o.email.toLowerCase() !== email.toLowerCase());
  otps.push({ email: email.toLowerCase(), otp: otpCode, expiresAt: expiresAt });
  
  objectsToSheet_(otpSheet, OTP_HEADERS, otps);
  
  return jsonResponse({ ok: true });
}

function handleVerifyOTP(email, otp) {
  if (!email || !otp) return jsonResponse({ ok: false, error: "Email and OTP are required" });
  
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const otpSheet = getOrCreateSheet_(ss, "PendingOTPs", OTP_HEADERS);
  const otps = sheetToObjects_(otpSheet);
  
  const entry = otps.find(o => o.email.toLowerCase() === email.toLowerCase());
  if (!entry) {
    return jsonResponse({ ok: false, error: "No OTP request found for this email. Please request a new one." });
  }
  
  if (entry.otp !== otp.toString().trim()) {
    return jsonResponse({ ok: false, error: "Invalid verification code. Please try again." });
  }
  
  if (Date.now() > Number(entry.expiresAt)) {
    return jsonResponse({ ok: false, error: "Verification code has expired. Please request a new one." });
  }
  
  // OTP is verified successfully! Delete it from sheet so it can't be reused
  const updatedOtps = otps.filter(o => o.email.toLowerCase() !== email.toLowerCase());
  objectsToSheet_(otpSheet, OTP_HEADERS, updatedOtps);
  
  return jsonResponse({ ok: true });
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
