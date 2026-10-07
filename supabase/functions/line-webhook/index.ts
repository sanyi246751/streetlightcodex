const encoder = new TextEncoder();

async function signatureIsValid(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return difference === 0;
}

async function reply(replyToken: string, text: string, token: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('LINE_CHANNEL_SECRET');
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret || !token || !supabaseUrl || !serviceKey) return new Response('Server configuration error', { status: 500 });

  const raw = await request.text();
  if (!await signatureIsValid(raw, request.headers.get('x-line-signature'), secret)) return new Response('Invalid signature', { status: 401 });
  const payload = JSON.parse(raw);
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

  await Promise.all((payload.events || []).map(async (event: Record<string, unknown>) => {
    if (event.type !== 'message' || (event.message as Record<string, unknown>)?.type !== 'text') return;
    const message = (event.message as Record<string, unknown>).text;
    const replyToken = String(event.replyToken || '');
    const input = String(message || '').trim();
    const match = input.match(/^([^\s]+)\s+(.+)$/s);
    if (!match) {
      if (replyToken) await reply(replyToken, '請輸入「路燈編號 空格 故障情形」，例如：001 路燈不亮', token);
      return;
    }
    const [, streetlightId, fault] = match;
    const lampResponse = await fetch(`${supabaseUrl}/rest/v1/streetlights?id=eq.${encodeURIComponent(streetlightId)}&select=id`, { headers });
    const lamps = await lampResponse.json();
    if (!lampResponse.ok || !Array.isArray(lamps) || lamps.length === 0) {
      if (replyToken) await reply(replyToken, `查無路燈編號「${streetlightId}」，請確認燈桿編號後再試。`, token);
      return;
    }
    const source = event.source as Record<string, unknown> | undefined;
    const insert = await fetch(`${supabaseUrl}/rest/v1/repair_reports`, {
      method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ streetlight_id: streetlightId, reported_at: new Date().toISOString(), fault: fault.slice(0, 1000), status: '未查修', metadata: { source: 'line-bot', line_user_id: source?.userId || null, line_event_id: event.webhookEventId || null } }),
    });
    const reports = await insert.json().catch(() => []);
    if (!insert.ok || !reports[0]) {
      if (replyToken) await reply(replyToken, '報修建立失敗，請稍後再試。', token);
      return;
    }
    await fetch(`${supabaseUrl}/functions/v1/line-fault-notification`, { method: 'POST', headers, body: JSON.stringify({ reportId: reports[0].id }) });
    if (replyToken) await reply(replyToken, `已完成通報：路燈 ${streetlightId}\n故障情形：${fault}\n案件已加入未查修清單。`, token);
  }));
  return new Response('OK', { status: 200 });
});
