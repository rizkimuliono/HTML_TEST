/**
 * HTML LAB -> Google Sheets receiver
 *
 * 1. Buka Apps Script dari spreadsheet yang digunakan.
 * 2. Tempel file ini, simpan, lalu Deploy > New deployment > Web app.
 * 3. Execute as: Me, Who has access: Anyone.
 * 4. Tempel URL /exec hasil deployment ke config.js -> apiUrl.
 *
 * Kredensial Google Drive tidak pernah dibutuhkan di frontend GitHub Pages.
 * Apps Script berjalan sebagai akun pemilik spreadsheet.
 */
const SHEET_ID = '1sUlV2QQhimNDJi828dG_sFs46QNtmD9Isdcmb2nB1Jw';
const SHEET_NAME = 'hasil_test';

function doGet() {
  return jsonResponse({ ok: true, service: 'HTML LAB', timestamp: new Date().toISOString() });
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || '{}');
    const sheet = getSheet();
    ensureHeader(sheet);
    sheet.appendRow([
      new Date(),
      payload.npm || '',
      payload.name || '',
      payload.course || 'HTML // FOUNDATIONS',
      Number(payload.score || 0),
      Number(payload.passedCount || 0),
      Number(payload.total || 20),
      Number(payload.durationSeconds || 0),
      payload.completedAt || ''
    ]);
    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: String(error) });
  }
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  return spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Timestamp', 'NPM', 'Nama', 'Course', 'Skor', 'Benar', 'Total Soal', 'Durasi (detik)', 'Completed At']);
    sheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
