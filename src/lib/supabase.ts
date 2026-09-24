const url = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured = Boolean(url && key);

const headers = (extra: Record<string, string> = {}) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  ...extra
});

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isSupabaseConfigured) throw new Error('Supabase 尚未設定');
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: headers(init.headers as Record<string, string> || {})
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase ${response.status}: ${detail}`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const supabaseSelect = <T>(table: string, query = '') =>
  request<T[]>(`/rest/v1/${table}?${query}`);

// Supabase/PostgREST projects commonly cap one response at 1,000 rows.
// Fetch successive pages so maps and history lists are never silently truncated.
export async function supabaseSelectAll<T>(table: string, query = ''): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const pageQuery = [query, `limit=${pageSize}`, `offset=${offset}`]
      .filter(Boolean)
      .join('&');
    const page = await supabaseSelect<T>(table, pageQuery);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export const supabaseInsert = <T>(table: string, body: unknown) =>
  request<T[]>(`/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });

export const supabaseUpdate = <T>(table: string, query: string, body: unknown) =>
  request<T[]>(`/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(body)
  });

export const supabaseDelete = (table: string, query: string) =>
  request<void>(`/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });

export type StoredPhoto = { path: string; url: string };

export async function uploadDataUrl(dataUrl: string, folder: string): Promise<StoredPhoto> {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('照片格式錯誤');
  const mime = match[1];
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const name = `${folder}/${crypto.randomUUID()}.${ext}`;
  const response = await fetch(`${url}/storage/v1/object/streetlight-photos/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': mime, 'x-upsert': 'false' }),
    body: bytes
  });
  if (!response.ok) throw new Error(`照片上傳失敗: ${await response.text()}`);
  return { path: name, url: `${url}/storage/v1/object/public/streetlight-photos/${name}` };
}

export type PhotoDestination = 'base-survey' | 'replacement' | 'repair';
type SignedUpload = { path: string; signedUrl: string; token?: string };

/** PUT the untouched File to a short-lived, single-use Storage URL. */
export async function uploadCasePhoto(file: File, destination: PhotoDestination, recordId: string | number, slot: string) {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured');
  if (!file.type.startsWith('image/')) throw new Error('Only image files are allowed');
  const signed = await request<SignedUpload>('/functions/v1/case-photo-upload-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, recordId, slot, contentType: file.type })
  });
  const response = await fetch(signed.signedUrl, {
    method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file
  });
  if (!response.ok) throw new Error(`Photo upload failed: ${await response.text()}`);
  return signed.path;
}
