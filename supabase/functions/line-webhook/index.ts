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

function parseReportText(input: string) {
  const rawNumbers = input.match(/\d{4,5}/g) || [];
  const numbers = [...new Set(rawNumbers.map(number => number.length === 4 ? `0${number}` : number))];
  const noNumber = /(?:沒有|不知道|沒)\s*(?:路燈)?(?:編號|號碼)/.test(input);
  const issueSource = input.replace(/\d{4,5}/g, '').replace(/路燈/g, '').replace(/(?:沒有|不知道|沒)\s*(?:編號|號碼)/g, '').trim();
  if (!issueSource) return { numbers: noNumber ? ['99999'] : [], issue: '' };
  let issue = issueSource;
  if (/(?:不亮|沒亮|黑漆漆|壞了|故障)/.test(issueSource)) issue = '路燈不亮';
  else if (/閃爍/.test(issueSource)) issue = '路燈閃爍';
  else if (/(?:白天.*亮|亮燈)/.test(issueSource)) issue = '白天亮燈';
  else if (/(?:轉向|傾斜)/.test(issueSource)) issue = '燈桿傾斜或損壞';
  return { numbers: numbers.length ? numbers : (noNumber ? ['99999'] : []), issue };
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
    const { numbers, issue } = parseReportText(input);
    if (!numbers.length || !issue) {
      if (replyToken) await reply(replyToken, '請輸入「路燈編號＋故障情形」，例如：01001不亮、01001 路燈不亮。', token);
      return;
    }
    const source = event.source as Record<string, unknown> | undefined;
    const reported: string[] = [];
    const invalid: string[] = [];
    for (const streetlightId of numbers) {
      const isNoNumberReport = streetlightId === '99999';
      if (!isNoNumberReport) {
        const lampResponse = await fetch(`${supabaseUrl}/rest/v1/streetlights?id=eq.${encodeURIComponent(streetlightId)}&select=id`, { headers });
        const lamps = await lampResponse.json();
        if (!lampResponse.ok || !Array.isArray(lamps) || lamps.length === 0) { invalid.push(streetlightId); continue; }
      }
      const insert = await fetch(`${supabaseUrl}/rest/v1/repair_reports`, {
        method: 'POST', headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({ streetlight_id: streetlightId, reported_at: new Date().toISOString(), fault: issue.slice(0, 1000), status: '未查修', metadata: { source: 'line-bot', line_user_id: source?.userId || null, line_event_id: event.webhookEventId || null, original_text: input } }),
      });
      const reports = await insert.json().catch(() => []);
      if (!insert.ok || !reports[0]) { invalid.push(streetlightId); continue; }
      reported.push(streetlightId);
      await fetch(`${supabaseUrl}/functions/v1/line-fault-notification`, { method: 'POST', headers, body: JSON.stringify({ reportId: reports[0].id }) });
    }
    if (replyToken) {
      const lines = reported.length ? [`已完成通報：${reported.join('、')}`, `故障情形：${issue}`, '案件已加入未查修清單。'] : ['報修建立失敗，請稍後再試。'];
      if (invalid.length) lines.push(`未建立案件的編號：${invalid.join('、')}，請確認路燈編號。`);
      await reply(replyToken, lines.join('\n'), token);
    }
  }));
  return new Response('OK', { status: 200 });
});
