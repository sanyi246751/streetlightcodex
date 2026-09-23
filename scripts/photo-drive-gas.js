/* Deploy as a Web App: Execute as Me; access Anyone. */
var UPLOAD_SECRET = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';
var FOLDERS = {
  'base-survey': '1drZ7J-9yuE2tGqh34iPSzwx04c2xfK-x',
  'replacement': '1IIIU2Q7fcbIlCP4-wsNd7hQ5GcwzhjkM',
  'repair': '1oDuIfD-zC-6GsbOLAv_BUCqyw4Kw01Xp'
};

function doPost(e) {
  try {
    var p = JSON.parse(e.postData.contents || '{}');
    if (p.secret !== UPLOAD_SECRET) return json({ ok: false, error: 'Unauthorized' });
    if (!FOLDERS[p.destination] || !/^https:\/\//.test(p.sourceUrl || '')) return json({ ok: false, error: 'Invalid request' });
    var response = UrlFetchApp.fetch(p.sourceUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return json({ ok: false, error: 'Supabase download failed: ' + response.getResponseCode() });
    var file = DriveApp.getFolderById(FOLDERS[p.destination]).createFile(response.getBlob().setName(p.fileName || ('streetlight-' + Date.now() + '.jpg')));
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return json({ ok: true, id: file.getId(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' });
  } catch (error) { return json({ ok: false, error: String(error) }); }
}

function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
