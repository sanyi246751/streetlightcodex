import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sql = require('mssql/msnodesqlv8');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'photo-browser-dist');

const app = express();
const port = Number(process.env.PHOTO_BROWSER_PORT || 4174);

// Windows integrated authentication means no database password is stored in
// source code.  This service only listens on this computer.
const pool = new sql.ConnectionPool({
  connectionString: 'Driver={ODBC Driver 18 for SQL Server};Server=localhost\\SQLEXPRESS01;Database=sanyi_20201216;Trusted_Connection=Yes;TrustServerCertificate=Yes;',
  requestTimeout: 120000,
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
          (SELECT CASE WHEN COUNT(*) > 3 THEN 3 ELSE COUNT(*) END FROM dbo.IMG i WHERE i.LAMPID = l.LAMPID) AS photoCount,
          0 AS originalPhotoCount
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
      SELECT TOP (3) 'current' AS source, ImgID AS imageId, ImgName AS imageName, LampNo AS lampNo,
             DATALENGTH(photo) AS bytes
      FROM dbo.IMG WHERE LAMPID = @lampId
      ORDER BY ImgID`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/gallery', async (req, res, next) => {
  try {
    const db = await poolReady;
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(120, Math.max(1, Number.parseInt(String(req.query.limit || '80'), 10) || 80));
    const result = await db.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        WITH rankedPhotos AS (
          SELECT 'current' AS source, ImgID AS imageId, ImgName AS imageName, LampNo AS lampNo, LAMPID AS lampId,
                 ROW_NUMBER() OVER (PARTITION BY LAMPID ORDER BY ImgID) AS photoOrder
          FROM dbo.IMG
        )
        SELECT source, imageId, imageName, lampNo, lampId
        FROM rankedPhotos
        WHERE photoOrder <= 3
        ORDER BY lampNo, imageId
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
    res.json({ items: result.recordset, offset, hasMore: result.recordset.length === limit });
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
