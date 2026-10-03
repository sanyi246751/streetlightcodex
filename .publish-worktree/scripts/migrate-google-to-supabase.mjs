import fs from 'node:fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split(/=(.*)/s).slice(0, 2))
);
const base = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!base || !key) throw new Error('缺少 .env.local 的 Supabase 設定');

const sheetId = '1z6LgYfHXVrxP8bFz2pHtexkJZgg1lle_FhiQMt71mqs';
const sheet = name => `https://opensheet.vercel.app/${sheetId}/${encodeURIComponent(name)}`;
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

function toTaipeiIso(value) {
  if (!value) return new Date().toISOString();
  const text = String(value).trim();
  const zh = text.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s*(上午|下午)\s*(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (zh) {
    const [, year, month, day, period, rawHour, minute, second = '0'] = zh;
    let hour = Number(rawHour) % 12;
    if (period === '下午') hour += 12;
    const pad = number => String(number).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+08:00`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  console.warn(`無法辨識日期「${text}」，改用目前時間`);
  return new Date().toISOString();
}

async function readSheet(name) {
  const response = await fetch(sheet(name));
  if (!response.ok) throw new Error(`${name} 讀取失敗: ${response.status}`);
  return response.json();
}

async function upsert(table, rows, onConflict) {
  if (!rows.length) return;
  const response = await fetch(`${base}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows)
  });
  if (!response.ok) throw new Error(`${table} 匯入失敗: ${await response.text()}`);
  console.log(`${table}: ${rows.length} 筆`);
}

const [lights, repairs] = await Promise.all([
  readSheet('路燈位置參考'),
  readSheet('回復表-路燈查修-升冪')
]);

await upsert('streetlights', lights.map(row => ({
  id: String(row['原路燈號碼'] || '').trim(),
  latitude: Number(row['緯度Latitude']),
  longitude: Number(row['經度Longitude']),
  metadata: row
})).filter(row => row.id && Number.isFinite(row.latitude) && Number.isFinite(row.longitude)), 'id');

await upsert('repair_reports', repairs.map(row => ({
  streetlight_id: String(row['路燈編號'] || '').trim(),
  reported_at: toTaipeiIso(row['通報時間']),
  fault: row['故障情形'] || '',
  status: row['維修情形'] || '未查修',
  note: row['備註'] || null,
  metadata: row
})).filter(row => row.streetlight_id), 'id');

console.log('Google Sheets → Supabase 匯入完成');
