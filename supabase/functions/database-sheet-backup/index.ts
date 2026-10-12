import { createClient } from 'npm:@supabase/supabase-js';

const allowedTables = {
  streetlights: {
    sheetName: '路燈主檔', order: 'id',
    columns: ['id', 'latitude', 'longitude', 'village_code', 'village_name', 'STREET', 'STYPE', 'SEAT', 'HEIGHT', 'metadata', 'created_at', 'updated_at'],
    headers: ['路燈編號', '緯度', '經度', '村里代碼', '村里名稱', 'STREET（道路）', 'STYPE（桿型）', 'SEAT（座型）', 'HEIGHT（高度）', '原始資料', '建立時間', '更新時間'],
  },
  repair_reports: { sheetName: '報修／查修', order: 'reported_at.desc', columns: ['id', 'streetlight_id', 'reported_at', 'fault', 'status', 'repaired_at', 'note', 'before_photo_url', 'after_photo_url', 'reporter_name', 'metadata', 'created_at'] },
  replacement_history: { sheetName: '置換歷程', order: 'created_at.desc', columns: ['id', 'streetlight_id', 'old_latitude', 'old_longitude', 'new_latitude', 'new_longitude', 'action', 'note', 'photo_url', 'created_at'] },
  base_surveys: { sheetName: '基座調查', order: 'surveyed_at.desc', columns: ['id', 'streetlight_id', 'surveyed_at', 'latitude', 'longitude', 'before_photo_url', 'after_photo_url', 'created_at'] },
} as const;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

function formatTaipeiDateTime(value: unknown) {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return sheetValue(value);
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}/${get('month')}/${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function sheetValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function repairPhotoValue(row: Record<string, unknown>, column: string) {
  const directUrl = row[column];
  if (directUrl) return directUrl;
  const photos = (row.metadata as { photos?: unknown[] } | null)?.photos;
  if (!Array.isArray(photos)) return null;
  return photos[column === 'before_photo_url' ? 0 : 1] || null;
}

function photoPreviewUrl(value: unknown) {
  const photoUrl = sheetValue(value);
  const driveFileId = photoUrl.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1]
    || photoUrl.match(/[?&]id=([^&#]+)/)?.[1];
  return driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1000` : photoUrl;
}

function sheetPhotoFormula(value: unknown) {
  if (!value) return '';
  // Google Sheets evaluates strings beginning with '=' as formulas.  Mode 4
  // fixes a readable thumbnail size, matching the management-screen preview.
  return `=IFERROR(IMAGE("${photoPreviewUrl(value).replace(/"/g, '""')}",4,100,140),"無法顯示照片")`;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: cors });
  try {
    const { table } = await request.json();
    if (typeof table !== 'string' || !(table in allowedTables)) throw new Error('Unsupported backup table');
    const config = allowedTables[table as keyof typeof allowedTables];
    const headers = 'headers' in config ? config.headers : config.columns;
    const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'));
    const pageSize = 1000;
    const data: Record<string, unknown>[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await supabase.from(table).select(config.columns.join(','))
        .order(config.order.split('.')[0], { ascending: !config.order.endsWith('.desc') })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Supabase read failed: ${error.message}`);
      data.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }
    const rows = data.map((row) => config.columns.map((column) => {
      if (table === 'repair_reports' && (column === 'before_photo_url' || column === 'after_photo_url')) {
        return sheetPhotoFormula(repairPhotoValue(row, column));
      }
      return table === 'streetlights' && (column === 'created_at' || column === 'updated_at')
        ? formatTaipeiDateTime(row[column])
        : sheetValue(row[column]);
    }));
    const response = await fetch(required('GAS_DATABASE_BACKUP_URL'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'database-backup', secret: required('GAS_DATABASE_BACKUP_SECRET'), sheetName: config.sheetName, headers, rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(`Google Sheet backup failed: ${result.error || response.statusText}`);
    return new Response(JSON.stringify({ ok: true, sheetName: config.sheetName, rowCount: rows.length, spreadsheetUrl: result.spreadsheetUrl }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: cors });
  }
});
