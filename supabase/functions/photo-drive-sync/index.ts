import { createClient } from 'npm:@supabase/supabase-js';

const headers = { 'Content-Type': 'application/json' };
type Job = { id: number; storage_path: string; destination: 'base-survey' | 'replacement' | 'repair'; record_id: number; slot: string; status: string; drive_file_id?: string; drive_url?: string };

function required(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Edge Function secret: ${name}`);
  return value;
}

async function uploadThroughGas(job: Job, signedUrl: string) {
  const response = await fetch(required('GAS_PHOTO_UPLOAD_URL'), {
    method: 'POST', headers,
    body: JSON.stringify({ secret: required('GAS_PHOTO_UPLOAD_SECRET'), sourceUrl: signedUrl,
      destination: job.destination, fileName: `${job.destination}-${job.record_id}-${job.slot}-${crypto.randomUUID()}.jpg` })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !data.id || !data.url) throw new Error(`GAS Drive upload failed: ${data.error || response.statusText}`);
  return { id: String(data.id), url: String(data.url) };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers });
  if (request.headers.get('x-photo-sync-secret') !== required('PHOTO_SYNC_CRON_SECRET')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
  const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: jobs, error } = await supabase.rpc('claim_photo_transfers', { batch_size: 10 });
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
  const results: Array<{ id: number; status: string }> = [];
  for (const job of (jobs || []) as Job[]) {
    try {
      let drive = { id: job.drive_file_id || '', url: job.drive_url || '' };
      if (job.status !== 'drive_uploaded') {
        const publicPath = job.storage_path.split('/').map(encodeURIComponent).join('/');
        const sourceUrl = `${required('SUPABASE_URL')}/storage/v1/object/public/streetlight-photos/${publicPath}`;
        drive = await uploadThroughGas(job, sourceUrl);
        const { error: recordedError } = await supabase.rpc('record_drive_upload', { job_id: job.id, file_id: drive.id, file_url: drive.url });
        if (recordedError) throw new Error(recordedError.message);
      }
      const { error: finishError } = await supabase.rpc('finish_photo_transfer', { job_id: job.id, file_id: drive.id, file_url: drive.url });
      const { error: removeError } = await supabase.storage.from('streetlight-photos').remove([job.storage_path]);
      if (removeError) throw new Error(`Drive upload succeeded but temporary deletion failed: ${removeError.message}`);
      if (finishError) throw new Error(finishError.message);
      results.push({ id: job.id, status: 'completed' });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await supabase.rpc('fail_photo_transfer', { job_id: job.id, error_message: message });
      results.push({ id: job.id, status: 'failed' });
    }
  }
  return new Response(JSON.stringify({ processed: results }), { headers });
});
