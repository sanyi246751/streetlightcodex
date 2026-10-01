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
          l.Neighborhood AS neighborhood, l.STREET AS street, l.LANE AS lane, l.ALLEY AS alley,
          l.ADD_NO AS addressNo, l.SLADD AS fullAddress, l.STYPE AS poleType,
          l.DIR AS direction, l.ADD_DIS AS addressDetail, l.SEAT AS fixturePosition,
          l.HEIGHT AS height, l.MAT AS material, l.SMAT AS armMaterial, l.WAT AS watt,
          l.ICOUNT AS fixtureCount, l.ADDMEMO AS addressMemo, l.NOTE AS note,
          l.marksubname AS maintenanceArea, l.DAN AS circuit, l.LampStatus AS lampStatus,
          l.lng AS longitude, l.lat AS latitude, l.UPDAY AS updatedAt,
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

app.get('/api/all-lights', async (req, res, next) => {
  try {
    const db = await poolReady;
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(80, Math.max(1, Number.parseInt(String(req.query.limit || '40'), 10) || 40));
    const result = await db.request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT l.LAMPID AS lampId, l.LAMP_NO AS lampNo, l.VILLAGE AS village,
               l.Neighborhood AS neighborhood, l.STREET AS street, l.LANE AS lane, l.ALLEY AS alley,
               l.ADD_NO AS addressNo, l.SLADD AS fullAddress, l.STYPE AS poleType,
               l.DIR AS direction, l.ADD_DIS AS addressDetail, l.SEAT AS fixturePosition,
               l.HEIGHT AS height, l.MAT AS material, l.SMAT AS armMaterial, l.WAT AS watt,
               l.ICOUNT AS fixtureCount, l.ADDMEMO AS addressMemo, l.NOTE AS note,
               l.marksubname AS maintenanceArea, l.DAN AS circuit, l.LampStatus AS lampStatus,
               l.lng AS longitude, l.lat AS latitude, l.UPDAY AS updatedAt,
               (SELECT TOP (3) ImgID AS imageId, ImgName AS imageName
                FROM dbo.IMG i WHERE i.LAMPID = l.LAMPID ORDER BY ImgID FOR JSON PATH) AS photos
        FROM dbo.SanyiLamp l
        ORDER BY l.LAMP_NO, l.LAMPID
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`);
    res.json({ items: result.recordset.map((light) => ({
      ...light,
      photos: JSON.parse(light.photos || '[]').map((photo) => ({ ...photo, source: 'current', lampNo: light.lampNo })),
    })), offset, hasMore: result.recordset.length === limit });
  } catch (error) { next(error); }
});

app.get('/api/boxes', async (_req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().query(`
      SELECT BoxID AS boxId, BoxNO AS boxNo, Village AS village, Street AS street,
             Lane AS lane, Alley AS alley, Add_no AS addressNo, Box_SLADD AS address,
             Type AS boxType, Height AS height, Mainbranch AS mainBranch,
             BoxStatus AS boxStatus, Box_Memo AS memo, BoxMark AS maintenanceArea, UPDAY AS updatedAt
      FROM dbo.SanyiBox ORDER BY BoxNO`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/repairs', async (_req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().query(`
      SELECT TOP (500) NT_ID AS repairId, NT_NO AS repairNo, LAMP_NO AS lampNo,
             NT_ITEM AS repairItem, NT_MEMO AS memo, NT_DATE AS reportedAt,
             NT_Address AS address, WK_ENDDATE AS dueDate, FSH_DATE AS finishedAt,
             CHK_STATE AS checkStatus, NTClassification AS classification
      FROM dbo.NOTIFY ORDER BY NT_DATE DESC, NT_ID DESC`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/projects', async (_req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().query(`
      SELECT p.PRJID AS projectId, p.PRJYEAR AS projectYear, p.PRJNO AS projectNo,
             p.PRJNAME AS projectName, p.PRJMONEY AS projectAmount, p.PRJSDATE AS startedAt,
             p.PRJEDATE AS endedAt, p.WORKDAYS AS workDays, p.PrjStatus AS projectStatus,
             c.COMPNAME AS companyName
      FROM dbo.PROJECT p LEFT JOIN dbo.Company c ON c.CompID = p.COMPID
      ORDER BY p.PRJYEAR DESC, p.PRJID DESC`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/tables', async (_req, res, next) => {
  try {
    const db = await poolReady;
    const result = await db.request().query(`
      SELECT t.name AS tableName, SUM(p.rows) AS [rowCount]
      FROM sys.tables t LEFT JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
      WHERE SCHEMA_NAME(t.schema_id) = N'dbo'
      GROUP BY t.name ORDER BY t.name`);
    res.json({ items: result.recordset });
  } catch (error) { next(error); }
});

app.get('/api/tables/:tableName', async (req, res, next) => {
  try {
    const db = await poolReady;
    const tableName = String(req.params.tableName);
    const offset = Math.max(0, Number.parseInt(String(req.query.offset || '0'), 10) || 0);
    const tableResult = await db.request().input('tableName', sql.NVarChar(128), tableName).query(`
      SELECT t.object_id FROM sys.tables t WHERE t.schema_id = SCHEMA_ID(N'dbo') AND t.name = @tableName`);
    const objectId = tableResult.recordset[0]?.object_id;
    if (!objectId) return res.status(404).json({ error: '找不到資料表' });
    const columnResult = await db.request().input('objectId', sql.Int, objectId).query(`
      SELECT c.name AS columnName, ty.name AS dataType, c.column_id AS columnNo
      FROM sys.columns c JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      WHERE c.object_id = @objectId ORDER BY c.column_id`);
    const columns = columnResult.recordset;
    const quote = (name) => `[${name.replace(/]/g, ']]')}]`;
    const fields = columns.map(({ columnName, dataType }) => {
      const lower = columnName.toLowerCase();
      if (lower.includes('password') || lower === 'pswd') return `N'[已遮蔽]' AS ${quote(columnName)}`;
      if (['varbinary', 'binary', 'image'].includes(dataType)) return `CONCAT(N'[二進位資料 ', COALESCE(CONVERT(nvarchar(20), DATALENGTH(${quote(columnName)})), N'0'), N' bytes]') AS ${quote(columnName)}`;
      return quote(columnName);
    }).join(', ');
    const safeTable = quote(tableName);
    const dataResult = await db.request().query(`SELECT ${fields} FROM dbo.${safeTable} ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT 500 ROWS ONLY`);
    res.json({ tableName, columns: columns.map(({ columnName, dataType }) => ({ columnName, dataType })), rows: dataResult.recordset, offset, hasMore: dataResult.recordset.length === 500 });
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
