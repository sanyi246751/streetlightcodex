import type { HistoryRecord, RepairRecord, StreetLightLocation } from '../types';
import { supabaseDelete, supabaseInsert, supabaseSelectAll, supabaseUpdate, uploadDataUrl } from '../lib/supabase';

type StreetlightRow = { id: string; latitude: number; longitude: number; metadata?: Record<string, unknown> };
type RepairRow = { id: number; streetlight_id: string; reported_at: string; fault: string; status: string; note?: string; metadata?: Record<string, unknown> };

export async function getStreetlights(): Promise<StreetLightLocation[]> {
  const rows = await supabaseSelectAll<StreetlightRow>('streetlights', 'select=id,latitude,longitude,metadata&order=id');
  return rows.map(r => ({
    ...(r.metadata || {}),
    '原路燈號碼': r.id,
    '緯度Latitude': String(r.latitude),
    '經度Longitude': String(r.longitude)
  }));
}

export async function getRepairRecords(): Promise<RepairRecord[]> {
  const rows = await supabaseSelectAll<RepairRow>('repair_reports', 'select=*&order=reported_at.desc');
  return rows.map(r => ({
    ...(r.metadata || {}),
    '路燈編號': r.streetlight_id,
    '通報時間': r.reported_at,
    '維修情形': r.status,
    '故障情形': r.fault,
    '備註': r.note || ''
  }));
}

export async function getPendingRepairs() {
  const rows = await supabaseSelectAll<RepairRow>('repair_reports', 'select=*&status=eq.%E6%9C%AA%E6%9F%A5%E4%BF%AE&order=reported_at');
  return rows.map(r => ({ row: String(r.id), colA: r.streetlight_id, colB: r.fault, text: `${r.streetlight_id} ${r.fault}`.trim() }));
}

export async function completeRepair(id: string, note: string, dateStr: string, photos: Array<{pre: string; post: string}>) {
  // Create fixed array slots before Storage triggers queue jobs, so a fast
  // background sync can safely replace each slot with its Drive URL.
  await supabaseUpdate('repair_reports', `id=eq.${encodeURIComponent(id)}`, {
    status: '已查修', repaired_at: dateStr, note,
    metadata: { photos: Array(photos.length * 2).fill(null) }
  });
  await Promise.all(photos.flatMap((p, i) => [
    uploadDataUrl(p.pre, `repair-reports/${id}/photos/${i}-pre`),
    uploadDataUrl(p.post, `repair-reports/${id}/photos/${i}-post`)
  ]));
}

export async function saveBaseSurvey(input: { dateStr: string; lightId: string; lat: number | null; lng: number | null; photo1: string; photo2: string }) {
  const [survey] = await supabaseInsert<{ id: number }>('base_surveys', {
    streetlight_id: input.lightId, surveyed_at: input.dateStr,
    latitude: input.lat, longitude: input.lng,
    before_photo_url: null, after_photo_url: null
  });
  await Promise.all([
    input.photo1 ? uploadDataUrl(input.photo1, `base-surveys/${survey.id}/before`) : Promise.resolve(null),
    input.photo2 ? uploadDataUrl(input.photo2, `base-surveys/${survey.id}/after`) : Promise.resolve(null)
  ]);
  return [survey];
}

export async function getReplacementHistory(): Promise<HistoryRecord[]> {
  const rows = await supabaseSelectAll<any>('replacement_history', 'select=*&order=created_at.desc');
  return rows.map(r => ({
    '時間': r.created_at, '修改時間': r.created_at, '路燈編號': r.streetlight_id,
    '原緯度': String(r.old_latitude ?? ''), '原經度': String(r.old_longitude ?? ''),
    '新緯度': String(r.new_latitude ?? ''), '新經度': String(r.new_longitude ?? ''),
    '操作類型': r.action, '備註': r.note || '', '照片連結': r.photo_url || ''
  }));
}

export async function saveStreetlight(input: { id: string; lat: string; lng: string; beforeLat?: string; beforeLng?: string; villageCode?: string; villageName?: string; action: string; time?: string; image?: string }) {
  await supabaseInsert('streetlights', {
    id: input.id, latitude: Number(input.lat), longitude: Number(input.lng),
    village_code: input.villageCode || null, village_name: input.villageName || null
  }).catch(() => supabaseUpdate('streetlights', `id=eq.${encodeURIComponent(input.id)}`, {
    latitude: Number(input.lat), longitude: Number(input.lng),
    village_code: input.villageCode || null, village_name: input.villageName || null,
    updated_at: new Date().toISOString()
  }));
  const [history] = await supabaseInsert<{ id: number }>('replacement_history', {
    streetlight_id: input.id, old_latitude: input.beforeLat ? Number(input.beforeLat) : null,
    old_longitude: input.beforeLng ? Number(input.beforeLng) : null,
    new_latitude: Number(input.lat), new_longitude: Number(input.lng), action: input.action,
    photo_url: null, created_at: input.time || new Date().toISOString()
  });
  if (!input.image) return [history];
  await uploadDataUrl(input.image, `replacement-history/${history.id}/photo`);
  return [history];
}

export async function deleteReplacementHistory(items: Array<{id: string; time: string}>) {
  await Promise.all(items.map(i => supabaseDelete('replacement_history', `streetlight_id=eq.${encodeURIComponent(i.id)}&created_at=eq.${encodeURIComponent(i.time)}`)));
}
