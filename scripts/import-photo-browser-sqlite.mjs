// One-time migration helper. SQL Server must be available only while this runs.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const sql = require('mssql/msnodesqlv8');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// dotenv/config only loads .env by default; this project keeps local database
// settings in .env.local, so load it explicitly before reading PHOTO_BROWSER_*.
dotenv.config({ path: path.join(root, '.env.local'), override: true });
const output = path.resolve(process.env.PHOTO_BROWSER_SQLITE_PATH || path.join(root, '三義鄉路燈歷史照片瀏覽器', 'sanyi-history.sqlite'));
const server = process.env.PHOTO_BROWSER_SQL_SERVER || 'localhost\\SQLEXPRESS';
const database = process.env.PHOTO_BROWSER_SQL_DATABASE || 'sanyi_檢視用';
const driver = process.env.PHOTO_BROWSER_SQL_DRIVER || 'ODBC Driver 17 for SQL Server';
const tables = ['SanyiLamp', 'IMG', 'IMG_O', 'SanyiBox', 'NOTIFY', 'PROJECT', 'Company'];
const quote = (name) => `[${name.replaceAll(']', ']]')}]`;
const sqliteQuote = (name) => `"${name.replaceAll('"', '""')}"`;
const sqliteType = (type) => /binary|image|timestamp/i.test(type) ? 'BLOB' : /int|bit/i.test(type) ? 'INTEGER' : /decimal|numeric|float|real|money/i.test(type) ? 'REAL' : 'TEXT';

if (fs.existsSync(output)) {
  // A zero-byte file is usually created by an editor before the first import;
  // it is not a SQLite database and is safe to replace.
  if (fs.statSync(output).size === 0) fs.unlinkSync(output);
  else throw new Error(`為避免覆蓋資料，目標 SQLite 已存在：${output}`);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
const sqlite = new Database(output);
const pool = await new sql.ConnectionPool({ connectionString: `Driver={${driver}};Server=${server};Database=${database};Trusted_Connection=Yes;TrustServerCertificate=Yes;Encrypt=No;`, options: { trustedConnection: true }, requestTimeout: 0 }).connect();

try {
  for (const table of tables) {
    const metadata = await pool.request().input('table', sql.NVarChar, table).query(`SELECT c.name, ty.name AS type FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=OBJECT_ID(N'dbo.' + @table) ORDER BY c.column_id`);
    const columns = metadata.recordset;
    if (!columns.length) { console.warn(`略過不存在的資料表：${table}`); continue; }
    sqlite.exec(`CREATE TABLE ${sqliteQuote(table)} (${columns.map((column) => `${sqliteQuote(column.name)} ${sqliteType(column.type)}`).join(', ')})`);
    const insert = sqlite.prepare(`INSERT INTO ${sqliteQuote(table)} (${columns.map((column) => sqliteQuote(column.name)).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`);
    console.log(`正在匯入 ${table}…`);
    await new Promise((resolve, reject) => {
      const request = pool.request(); request.stream = true;
      let count = 0; sqlite.exec('BEGIN');
      request.on('row', (row) => { insert.run(...columns.map((column) => row[column.name] instanceof Date ? row[column.name].toISOString() : row[column.name])); count += 1; });
      request.on('error', (error) => { try { sqlite.exec('ROLLBACK'); } catch {} reject(error); });
      request.on('done', () => { sqlite.exec('COMMIT'); console.log(`${table}：${count.toLocaleString()} 筆`); resolve(); });
      request.query(`SELECT * FROM dbo.${quote(table)}`);
    });
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_img_lampid ON IMG(LAMPID); CREATE INDEX IF NOT EXISTS idx_lamp_no ON SanyiLamp(LAMP_NO);');
  console.log(`完成：${output}`);
} finally {
  sqlite.close();
  await pool.close();
}
