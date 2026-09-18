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
  const uploaded = await Promise.all(photos.flatMap((p, i) => [
    uploadDataUrl(p.pre, `repairs/${id}/${i}-pre`),
    uploadDataUrl(p.post, `repairs/${id}/${i}-post`)
  ]));
  return supabaseUpdate('repair_reports', `id=eq.${encodeURIComponent(id)}`, {
    status: '已查修', repaired_at: dateStr, note, metadata: { photos: uploaded }
  });
}

export async function saveBaseSurvey(input: { dateStr: string; lightId: string; lat: number | null; lng: number | null; photo1: string; photo2: string }) {
  const [before, after] = await Promise.all([
    input.photo1 ? uploadDataUrl(input.photo1, `surveys/${input.lightId}/before`) : Promise.resolve(null),
    input.photo2 ? uploadDataUrl(input.photo2, `surveys/${input.lightId}/after`) : Promise.resolve(null)
  ]);
  return supabaseInsert('base_surveys', {
    streetlight_id: input.lightId, surveyed_at: input.dateStr,
    latitude: input.lat, longitude: input.lng,
    before_photo_url: before, after_photo_url: after
  });
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
  const photoUrl = input.image ? await uploadDataUrl(input.image, `replacements/${input.id}`) : null;
  await supabaseInsert('streetlights', {
    id: input.id, latitude: Number(input.lat), longitude: Number(input.lng),
    village_code: input.villageCode || null, village_name: input.villageName || null
  }).catch(() => supabaseUpdate('streetlights', `id=eq.${encodeURIComponent(input.id)}`, {
    latitude: Number(input.lat), longitude: Number(input.lng),
    village_code: input.villageCode || null, village_name: input.villageName || null,
    updated_at: new Date().toISOString()
  }));
  return supabaseInsert('replacement_history', {
    streetlight_id: input.id, old_latitude: input.beforeLat ? Number(input.beforeLat) : null,
    old_longitude: input.beforeLng ? Number(input.beforeLng) : null,
    new_latitude: Number(input.lat), new_longitude: Number(input.lng), action: input.action,
    photo_url: photoUrl, created_at: input.time || new Date().toISOString()
  });
}

export async function deleteReplacementHistory(items: Array<{id: string; time: string}>) {
  await Promise.all(items.map(i => supabaseDelete('replacement_history', `streetlight_id=eq.${encodeURIComponent(i.id)}&created_at=eq.${encodeURIComponent(i.time)}`)));
}
