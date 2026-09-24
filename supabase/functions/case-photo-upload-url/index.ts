import { createClient } from 'npm:@supabase/supabase-js';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const destinations = new Set(['base-survey', 'replacement', 'repair']);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
  try {
    const { destination, recordId, slot, contentType } = await request.json();
    if (!destinations.has(destination) || !/^\d+$/.test(String(recordId)) || !/^[a-z0-9-]+$/.test(String(slot)) || !/^image\/[a-z0-9.+-]+$/i.test(String(contentType))) throw new Error('Invalid upload request');
    const table = destination === 'base-survey' ? 'base_surveys' : destination === 'replacement' ? 'replacement_history' : 'repair_reports';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: record, error: recordError } = await supabase.from(table).select('id,streetlight_id').eq('id', recordId).maybeSingle();
    if (recordError || !record) throw new Error('Case not found');
    const extension = /png/i.test(contentType) ? 'png' : /webp/i.test(contentType) ? 'webp' : 'jpg';
    const lightId = String(record.streetlight_id || '').trim().replace(/[\\/:*?"<>|]/g, '-');
    const side = slot === 'before' || slot.endsWith('-pre') ? '前' : '後';
    const path = destination === 'base-survey'
      ? `base-surveys/${lightId}_${side}.${extension}`
      : destination === 'repair'
        ? `repair-reports/${lightId}_${side}.${extension}`
        : `replacement-history/${recordId}/photo/${crypto.randomUUID()}.${extension}`;
    if ((destination === 'base-survey' || destination === 'repair') && !lightId) throw new Error('Streetlight ID is missing');
    const { data, error } = await supabase.storage.from('streetlight-photos').createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw error || new Error('Could not create signed upload URL');
    return new Response(JSON.stringify({ path, signedUrl: data.signedUrl, token: data.token }), { headers: cors });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 400, headers: cors });
  }
});
