/* Deploy as a Web App: Execute as Me; access Anyone.
 * Handles both photo uploads and database-to-Sheet backups.
 */
var UPLOAD_SECRET = '19820720';
var DATABASE_BACKUP_SECRET = '19820720';
var BACKUP_SPREADSHEET_ID = '1z6LgYfHXVrxP8bFz2pHtexkJZgg1lle_FhiQMt71mqs';
var FOLDERS = {
  'base-survey': '1drZ7J-9yuE2tGqh34iPSzwx04c2xfK-x',
  'replacement': '1IIIU2Q7fcbIlCP4-wsNd7hQ5GcwzhjkM',
  'repair': '1oDuIfD-zC-6GsbOLAv_BUCqyw4Kw01Xp'
};

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents || '{}');
    if (p.action === 'database-backup') return backupDatabaseToSheet(p);
    if (p.secret !== UPLOAD_SECRET) return json({ ok: false, error: 'Unauthorized' });
    if (!FOLDERS[p.destination] || !/^https:\/\//.test(p.sourceUrl || '')) return json({ ok: false, error: 'Invalid request' });
    var response = UrlFetchApp.fetch(p.sourceUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return json({ ok: false, error: 'Supabase download failed: ' + response.getResponseCode() });
    var file = DriveApp.getFolderById(FOLDERS[p.destination]).createFile(response.getBlob().setName(p.fileName || ('streetlight-' + Date.now() + '.jpg')));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return json({ ok: true, id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' });
  } catch (error) { return json({ ok: false, error: String(error) }); }
}

function backupDatabaseToSheet(p) {
  if (p.secret !== DATABASE_BACKUP_SECRET) return json({ ok: false, error: 'Unauthorized' });
  if (typeof p.sheetName !== 'string' || !Array.isArray(p.headers) || !Array.isArray(p.rows)) {
    return json({ ok: false, error: 'Invalid backup payload' });
  }
  var spreadsheet = SpreadsheetApp.openById(BACKUP_SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(p.sheetName) || spreadsheet.insertSheet(p.sheetName);
  sheet.clearContents();
  var values = [p.headers].concat(p.rows);
  if (values[0].length) sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, values[0].length);
  SpreadsheetApp.flush();
  return json({ ok: true, spreadsheetUrl: spreadsheet.getUrl() });
}

function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
