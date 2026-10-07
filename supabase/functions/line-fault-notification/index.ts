const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RepairReport = {
  id: number;
  streetlight_id: string;
  reported_at: string;
  fault: string;
  reporter_name: string | null;
  metadata: { phone?: string } | null;
};

type Streetlight = { latitude: number; longitude: number };

const text = (value: unknown, fallback = '未提供') => {
  const result = String(value ?? '').trim();
  return result || fallback;
};

function taipeiTime(value: string) {
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value));
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  try {
    const { reportId } = await request.json();
    const id = Number(reportId);
    if (!Number.isSafeInteger(id) || id < 1) {
      return Response.json({ error: 'Invalid report ID' }, { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lineToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const groupId = Deno.env.get('LINE_GROUP_ID');
    if (!supabaseUrl || !serviceRoleKey || !lineToken || !groupId) throw new Error('Missing server configuration');

    const queryHeaders = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
    const reportResponse = await fetch(
      `${supabaseUrl}/rest/v1/repair_reports?id=eq.${id}&select=id,streetlight_id,reported_at,fault,reporter_name,metadata`,
      { headers: queryHeaders },
    );
    const reports = await reportResponse.json() as RepairReport[];
    const report = reports[0];
    if (!reportResponse.ok || !report) return Response.json({ error: 'Report not found' }, { status: 404, headers: corsHeaders });

    const lampResponse = await fetch(
      `${supabaseUrl}/rest/v1/streetlights?id=eq.${encodeURIComponent(report.streetlight_id)}&select=latitude,longitude`,
      { headers: queryHeaders },
    );
    const lamps = await lampResponse.json() as Streetlight[];
    const lamp = lamps[0];
    const mapUrl = lamp && Number.isFinite(lamp.latitude) && Number.isFinite(lamp.longitude)
      ? `https://www.google.com/maps/search/?api=1&query=${lamp.latitude},${lamp.longitude}` : undefined;

    const fields: Array<Record<string, unknown>> = [
      { type: 'text', text: `通報時間：${taipeiTime(report.reported_at)}`, size: 'sm', margin: 'md', wrap: true },
      { type: 'text', text: `路燈編號：${text(report.streetlight_id)}`, size: 'sm', margin: 'md', wrap: true },
      { type: 'text', text: `故障情形：${text(report.fault)}`, size: 'sm', margin: 'md', wrap: true },
      { type: 'text', text: `通報人：${text(report.reporter_name)}`, size: 'sm', margin: 'md', wrap: true },
      { type: 'text', text: `聯絡電話：${text(report.metadata?.phone)}`, size: 'sm', margin: 'md', wrap: true },
    ];
    if (mapUrl) fields.push({ type: 'button', style: 'primary', margin: 'lg', action: { type: 'uri', label: '查看地圖', uri: mapUrl } });

    const lineResponse = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lineToken}` },
      body: JSON.stringify({
        to: groupId,
        messages: [{
          type: 'flex', altText: `路燈故障通報：${report.streetlight_id}`,
          contents: {
            type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [
              { type: 'text', text: '路燈故障通報', weight: 'bold', size: 'xl' },
              { type: 'separator', margin: 'md' }, ...fields,
            ] },
          },
        }],
      }),
    });
    if (!lineResponse.ok) throw new Error(`LINE push failed: ${lineResponse.status}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    console.error('[line-fault-notification]', error instanceof Error ? error.message : error);
    return Response.json({ error: 'Notification failed' }, { status: 500, headers: corsHeaders });
  }
});
