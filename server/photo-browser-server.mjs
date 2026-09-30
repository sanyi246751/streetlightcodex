import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sql = require('mssql/msnodesqlv8');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

const app = express();
const port = Number(process.env.PHOTO_BROWSER_PORT || 4174);

// Windows integrated authentication means no database password is stored in
// source code.  This service only listens on this computer.
const pool = new sql.ConnectionPool({
  connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS01;Database=sanyi_20201216;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  options: { trustedConnection: true },
});
const poolReady = pool.connect();

function searchPattern(value) {
  return `%${String(value || '').trim().replace(/[\\%_\[\]]/g, (char) => `\\${char}`)}%`;
}

app.get('/api/health', async (_req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().query('SELECT DB_NAME() AS databaseName');
    res.json({ ok: true, database: result.recordset[0].databaseName });
  } catch (error) { next(error); }
});

app.get('/api/lights', async (req, res, next) => {
  try {
    const db = await poolReady;
    const term = searchPattern(req.query.q);
    const result = await db.request()
      .input('term', sql.NVarChar(120), term)
      .query(`
        SELECT TOP (60)
          l.LAMPID AS lampId, l.LAMP_NO AS lampNo, l.VILLAGE AS village,
          l.STREET AS street, l.LANE AS lane, l.ALLEY AS alley,
          l.ADD_NO AS addressNo, l.SLADD AS fullAddress, l.STYPE AS poleType,
          l.WAT AS watt, l.LampStatus AS lampStatus,
          (SELECT COUNT(*) FROM dbo.IMG i WHERE i.LAMPID = l.LAMPID) AS photoCount,
          (SELECT COUNT(*) FROM dbo.IMG_O io WHERE io.LAMPID = l.LAMPID) AS originalPhotoCount
        FROM dbo.SanyiLamp l
        WHERE l.LAMP_NO LIKE @term ESCAPE '\\'
           OR l.VILLAGE LIKE @term ESCAPE '\\'
           OR l.STREET LIKE @term ESCAPE '\\'
           OR l.SLADD LIKE @term ESCAPE '\\'
        ORDER BY l.LAMP_NO`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/lights/:lampId/photos', async (req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().input('lampId', sql.Int, req.params.lampId).query(`
      SELECT 'current' AS source, ImgID AS imageId, ImgName AS imageName, LampNo AS lampNo,
             DATALENGTH(photo) AS bytes
      FROM dbo.IMG WHERE LAMPID = @lampId AND photo IS NOT NULL
      UNION ALL
      SELECT 'original' AS source, ImgID AS imageId, ImgName AS imageName, LampNo AS lampNo,
             DATALENGTH(photo) AS bytes
      FROM dbo.IMG_O WHERE LAMPID = @lampId AND photo IS NOT NULL
      ORDER BY source, imageName`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/photos/:source/:imageId', async (req, res, next) => {
  const table = req.params.source === 'original' ? 'IMG_O' : req.params.source === 'current' ? 'IMG' : null;
  if (!table) return res.status(404).json({ error: '找不到照片來源' });
  try {
    const db = await poolReady;
    const result = await db.request().input('imageId', sql.Int, req.params.imageId)
      .query(`SELECT photo FROM dbo.${table} WHERE ImgID = @imageId`);
    const image = result.recordset[0]?.photo;
    if (!image) return res.status(404).json({ error: '找不到照片' });
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }).send(image);
  } catch (error) { next(error); }
});

app.use('/streetlightcodex', express.static(distDir));
app.get('/streetlightcodex/*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
app.get('/', (_req, res) => res.redirect('/streetlightcodex/#/photos'));

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: '無法讀取本機 SQL Server 資料庫。請確認 SQLEXPRESS01 正在執行。' });
});

app.listen(port, '127.0.0.1', () => {
  console.log(`照片瀏覽器已啟動：http://127.0.0.1:${port}/streetlightcodex/#/photos`);
});
