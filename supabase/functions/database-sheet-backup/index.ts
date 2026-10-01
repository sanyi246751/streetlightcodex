import { createClient } from 'npm:@supabase/supabase-js';

const allowedTables = {
  streetlights: { sheetName: '路燈主檔', order: 'id', columns: ['id', 'latitude', 'longitude', 'village_code', 'village_name', 'metadata', 'created_at', 'updated_at'] },
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

function sheetValue(value: unknown) {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: cors });
  try {
    const { table } = await request.json();
    if (typeof table !== 'string' || !(table in allowedTables)) throw new Error('Unsupported backup table');
    const config = allowedTables[table as keyof typeof allowedTables];
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
    const rows = data.map((row) => config.columns.map((column) => sheetValue(row[column])));
    const response = await fetch(required('GAS_DATABASE_BACKUP_URL'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'database-backup', secret: required('GAS_DATABASE_BACKUP_SECRET'), sheetName: config.sheetName, headers: config.columns, rows }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(`Google Sheet backup failed: ${result.error || response.statusText}`);
    return new Response(JSON.stringify({ ok: true, sheetName: config.sheetName, rowCount: rows.length, spreadsheetUrl: result.spreadsheetUrl }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: cors });
  }
});
