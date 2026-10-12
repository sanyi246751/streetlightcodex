import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, Database, Edit3, FileSpreadsheet, Plus, Printer, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { backupTableToGoogleSheet, supabaseDelete, supabaseInsert, supabaseSelectAll, supabaseUpdate } from '../lib/supabase';

type FieldType = 'text' | 'number' | 'datetime' | 'textarea' | 'json' | 'url';
type Field = { key: string; label: string; type?: FieldType; readonly?: boolean; required?: boolean };
type TableConfig = { table: string; label: string; primaryKey: string; order: string; fields: Field[] };

const TABLES: TableConfig[] = [
  {
    table: 'streetlights', label: '路燈主檔', primaryKey: 'id', order: 'id', fields: [
      { key: 'id', label: '路燈編號', required: true },
      { key: 'latitude', label: '緯度', type: 'number', required: true },
      { key: 'longitude', label: '經度', type: 'number', required: true },
      { key: 'village_code', label: '村里代碼' }, { key: 'village_name', label: '村里名稱' },
      { key: 'STREET', label: 'STREET（道路）' }, { key: 'STYPE', label: 'STYPE（桿型）' },
      { key: 'SEAT', label: 'SEAT（座型）' }, { key: 'HEIGHT', label: 'HEIGHT（高度）' },
      { key: 'metadata', label: '原始資料', type: 'json' },
      { key: 'created_at', label: '建立時間', type: 'datetime', readonly: true },
      { key: 'updated_at', label: '更新時間', type: 'datetime', readonly: true }
    ]
  },
  {
    table: 'repair_reports', label: '報修／查修', primaryKey: 'id', order: 'reported_at.desc', fields: [
      { key: 'reported_at', label: '通報時間', type: 'datetime', required: true },
      { key: 'streetlight_id', label: '路燈編號', required: true },
      { key: 'fault', label: '故障情形', type: 'textarea' }, { key: 'status', label: '維修情形', required: true },
      { key: 'repaired_at', label: '完成時間', type: 'datetime' }, { key: 'note', label: '備註', type: 'textarea' },
      { key: 'before_photo_url', label: '維修前照片連結', type: 'url' },
      { key: 'after_photo_url', label: '維修後照片連結', type: 'url' },
      { key: 'reporter_name', label: '通報人' }, { key: 'metadata', label: '原始資料／照片', type: 'json' },
      { key: 'created_at', label: '建立時間', type: 'datetime', readonly: true }
    ]
  },
  {
    table: 'replacement_history', label: '置換歷程', primaryKey: 'id', order: 'created_at.desc', fields: [
      { key: 'id', label: '流水號', readonly: true }, { key: 'streetlight_id', label: '路燈編號', required: true },
      { key: 'old_latitude', label: '原緯度', type: 'number' }, { key: 'old_longitude', label: '原經度', type: 'number' },
      { key: 'new_latitude', label: '新緯度', type: 'number' }, { key: 'new_longitude', label: '新經度', type: 'number' },
      { key: 'action', label: '操作類型', required: true }, { key: 'note', label: '備註', type: 'textarea' },
      { key: 'photo_url', label: '照片連結', type: 'url' }, { key: 'created_at', label: '建立時間', type: 'datetime' }
    ]
  },
  {
    table: 'base_surveys', label: '基座調查', primaryKey: 'id', order: 'surveyed_at.desc', fields: [
      { key: 'id', label: '流水號', readonly: true }, { key: 'streetlight_id', label: '路燈編號', required: true },
      { key: 'surveyed_at', label: '調查時間', type: 'datetime', required: true },
      { key: 'latitude', label: '緯度', type: 'number' }, { key: 'longitude', label: '經度', type: 'number' },
      { key: 'before_photo_url', label: '施工前照片', type: 'url' }, { key: 'after_photo_url', label: '施工後照片', type: 'url' },
      { key: 'created_at', label: '建立時間', type: 'datetime', readonly: true }
    ]
  }
];

const PAGE_SIZE = 50;
const FAULT_OPTIONS = ['路燈不亮', '路燈閃爍', '白天仍亮', '燈具損壞', '燈桿傾斜或損壞', '電線外露', '其他'];
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const displayFieldValue = (value: unknown, type?: FieldType) => {
  if (type !== 'datetime' || value === null || value === undefined || value === '') return displayValue(value);
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return displayValue(value);
  return new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).format(date);
};

const inputValue = (value: unknown, type?: FieldType) => {
  if (value === null || value === undefined) return '';
  if (type === 'json') return JSON.stringify(value, null, 2);
  if (type === 'datetime') {
    const date = new Date(String(value));
    if (!Number.isNaN(date.getTime())) {
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
      return local.toISOString().slice(0, 16);
    }
  }
  return String(value);
};

const repairPhotoUrl = (row: Record<string, any>, field: Field) => {
  const directUrl = row[field.key];
  if (directUrl || (field.key !== 'before_photo_url' && field.key !== 'after_photo_url')) return directUrl;
  const photos = row.metadata?.photos;
  if (!Array.isArray(photos)) return directUrl;
  return photos[field.key === 'before_photo_url' ? 0 : 1] || null;
};

// Photo transfers store Google Drive's human-facing `/view` link.  That page
// cannot be used as an <img> source, so use Drive's image thumbnail endpoint
// for on-screen previews while retaining the original URL in the database.
const previewPhotoUrl = (value: unknown) => {
  const photoUrl = String(value || '');
  const driveFileId = photoUrl.match(/drive\.google\.com\/file\/d\/([^/?#]+)/)?.[1]
    || photoUrl.match(/[?&]id=([^&#]+)/)?.[1];
  return driveFileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w1600` : photoUrl;
};

function RepairPhotoThumbnail({ url, alt, onOpen }: { url: string; alt: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <a href={url} target="_blank" rel="noreferrer" className="text-cyan-700 underline text-xs">無法載入，開啟原始照片</a>;
  return <button type="button" onClick={onOpen} className="block h-14 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm hover:ring-2 hover:ring-cyan-500 focus:outline-none" title={`放大檢視${alt}`}><img src={previewPhotoUrl(url)} alt={alt} onError={() => setFailed(true)} className="h-full w-full object-cover" /></button>;
}

const repairDateValue = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
};

const printDate = (value: unknown) => displayFieldValue(value, 'datetime');

export default function AdminDatabaseView({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState(TABLES[0]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [selectedRepairIds, setSelectedRepairIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<{ url: string; alt: string } | null>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const loadRows = async () => {
    setLoading(true); setError('');
    try {
      setRows(await supabaseSelectAll<Record<string, any>>(config.table, `select=*&order=${config.order}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取資料失敗');
      setRows([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); setQuery(''); setDateFrom(''); setDateTo(''); setSelectedRepairIds(new Set()); loadRows(); }, [config]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const start = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const end = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return rows.filter(row => {
      const matchesKeyword = !keyword || config.fields.some(field => displayValue(row[field.key]).toLowerCase().includes(keyword));
      if (!matchesKeyword) return false;
      if (config.table !== 'repair_reports' || (!start && !end)) return true;
      const reportedAt = repairDateValue(row.reported_at);
      return !!reportedAt && (!start || reportedAt >= start) && (!end || reportedAt <= end);
    });
  }, [rows, query, config, dateFrom, dateTo]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  const changePage = (nextPage: number) => {
    setPage(Math.min(pageCount, Math.max(1, nextPage)));
    tableScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openCreate = () => {
    const draft: Record<string, any> = {};
    config.fields.forEach(field => {
      if (field.key === 'status') draft[field.key] = '未查修';
      else if (field.type === 'datetime' && !field.readonly) draft[field.key] = inputValue(new Date().toISOString(), 'datetime');
      else if (field.type === 'json') draft[field.key] = '{}';
      else draft[field.key] = '';
    });
    setIsNew(true); setEditing(draft);
  };

  const openEdit = (row: Record<string, any>) => {
    const draft: Record<string, any> = {};
    config.fields.forEach(field => { draft[field.key] = inputValue(row[field.key], field.type); });
    draft.__originalKey = row[config.primaryKey];
    // Older reports may have included an optional free-text suffix such as
    // 「路燈不亮：巷口」.  Preserve it until the user selects a replacement.
    setIsNew(false); setEditing(draft);
  };

  const preparePayload = () => {
    const payload: Record<string, any> = {};
    config.fields.forEach(field => {
      if (field.readonly || !editing) return;
      const raw = editing[field.key];
      if (raw === '') { payload[field.key] = null; return; }
      if (field.type === 'number') payload[field.key] = Number(raw);
      else if (field.type === 'json') payload[field.key] = JSON.parse(raw || '{}');
      else if (field.type === 'datetime') payload[field.key] = new Date(raw).toISOString();
      else payload[field.key] = raw;
    });
    return payload;
  };

  const save = async () => {
    if (!editing) return;
    for (const field of config.fields.filter(f => f.required && !f.readonly)) {
      if (editing[field.key] === '' || editing[field.key] === null) { setError(`請填寫「${field.label}」`); return; }
    }
    setSaving(true); setError('');
    try {
      const payload = preparePayload();
      if (isNew) await supabaseInsert(config.table, payload);
      else await supabaseUpdate(config.table, `${config.primaryKey}=eq.${encodeURIComponent(editing.__originalKey)}`, payload);
      setEditing(null); await loadRows();
    } catch (e) { setError(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setSaving(false); }
  };

  const remove = async (row: Record<string, any>) => {
    const key = row[config.primaryKey];
    if (!confirm(`確定刪除 ${config.label}「${key}」？此操作無法復原。`)) return;
    setError('');
    try {
      await supabaseDelete(config.table, `${config.primaryKey}=eq.${encodeURIComponent(key)}`);
      await loadRows();
    } catch (e) { setError(e instanceof Error ? e.message : '刪除失敗'); }
  };

  const toggleRepairSelection = (id: unknown) => {
    const key = String(id);
    setSelectedRepairIds(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleVisibleRepairSelection = () => {
    const ids = visibleRows.map(row => String(row[config.primaryKey]));
    const allVisibleSelected = ids.length > 0 && ids.every(id => selectedRepairIds.has(id));
    setSelectedRepairIds(current => {
      const next = new Set(current);
      ids.forEach(id => allVisibleSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const removeSelectedRepairs = async () => {
    const ids = [...selectedRepairIds];
    if (!ids.length) return;
    if (!confirm(`確定刪除已選取的 ${ids.length} 筆報修／查修案件？此操作無法復原。`)) return;
    setDeletingSelected(true); setError('');
    try {
      await Promise.all(ids.map(id => supabaseDelete('repair_reports', `id=eq.${encodeURIComponent(id)}`)));
      setSelectedRepairIds(new Set());
      await loadRows();
    } catch (e) { setError(e instanceof Error ? e.message : '批次刪除失敗'); }
    finally { setDeletingSelected(false); }
  };

  const backupToGoogleSheet = async () => {
    setBackingUp(true); setError('');
    try {
      const result = await backupTableToGoogleSheet(config.table);
      const target = result.spreadsheetUrl ? `，已寫入 ${result.spreadsheetUrl}` : '';
      alert(`「${result.sheetName}」已備份 ${result.rowCount.toLocaleString()} 筆資料${target}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '備份至 Google Sheet 失敗');
    } finally { setBackingUp(false); }
  };

  const printRepairReports = async () => {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setError('結束日期不可早於起始日期。');
      return;
    }
    // Preload first so the browser's print preview receives the actual photos,
    // rather than an unloaded placeholder from the screen-only report section.
    const urls = [...new Set(filtered.flatMap(row => [
      repairPhotoUrl(row, { key: 'before_photo_url', label: '' }),
      repairPhotoUrl(row, { key: 'after_photo_url', label: '' })
    ]).filter(Boolean).map(previewPhotoUrl))];
    await Promise.all(urls.map(src => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => resolve();
      image.src = src;
    })));
    window.print();
  };

  const printPeriod = dateFrom || dateTo
    ? `${dateFrom || '最早'} 至 ${dateTo || '最新'}`
    : '全部期間';

  return (
    <div className="h-[100dvh] bg-slate-100 text-slate-800 overflow-y-auto">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow-lg print:hidden">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10" aria-label="返回地圖"><ChevronLeft /></button>
          <Database className="text-cyan-400" />
          <div><h1 className="font-black text-lg">資料庫管理</h1><p className="text-xs text-slate-400">Supabase 全資料閱覽與編輯</p></div>
          <button onClick={loadRows} disabled={loading} className="ml-auto p-2 rounded-xl hover:bg-white/10 disabled:opacity-50" aria-label="重新整理"><RefreshCw className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-3 md:p-6">
        <div className="flex gap-2 overflow-x-auto pb-3 print:hidden">
          {TABLES.map(item => <button key={item.table} onClick={() => setConfig(item)} className={`px-4 py-2.5 rounded-xl font-bold whitespace-nowrap ${config.table === item.table ? 'bg-cyan-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>{item.label}</button>)}
        </div>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:hidden">
          <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="relative flex-1 max-w-xl"><Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={`搜尋${config.label}的所有欄位`} className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500" /></div>
            {config.table === 'repair_reports' && <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1 text-slate-600">通報日期<input aria-label="通報起始日期" type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-2" /></label>
              <span className="text-slate-400">至</span>
              <input aria-label="通報結束日期" type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="border border-slate-300 rounded-lg px-2 py-2" />
              <button onClick={() => void printRepairReports()} disabled={loading || filtered.length === 0} className="border border-sky-600 text-sky-700 hover:bg-sky-50 px-3 py-2 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Printer className="w-4 h-4" />列印案件</button>
            </div>}
            <span className="text-sm text-slate-500 sm:ml-auto">共 {filtered.length.toLocaleString()} 筆</span>
            {config.table === 'repair_reports' && <button onClick={() => void removeSelectedRepairs()} disabled={deletingSelected || selectedRepairIds.size === 0} className="border border-red-600 text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Trash2 className="w-4 h-4" />{deletingSelected ? '刪除中…' : `刪除已選 ${selectedRepairIds.size} 筆`}</button>}
            <button onClick={() => void backupToGoogleSheet()} disabled={backingUp || loading} className="border border-emerald-600 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" />{backingUp ? '備份中…' : '備份至 Google Sheet'}</button>
            <button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" />新增資料</button>
          </div>

          {error && <div className="m-3 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm break-all print:hidden">{error}</div>}
          <div ref={tableScrollRef} className="overflow-auto h-[calc(100dvh-310px)] min-h-[300px]">
            {loading ? <div className="p-16 text-center text-slate-500">資料載入中…</div> : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 sticky top-0 z-10"><tr>{config.table === 'repair_reports' && <th className="px-3 py-3 bg-slate-50"><input type="checkbox" aria-label="全選本頁案件" checked={visibleRows.length > 0 && visibleRows.every(row => selectedRepairIds.has(String(row[config.primaryKey])))} onChange={toggleVisibleRepairSelection} /></th>}{config.fields.filter(f => f.type !== 'json').map(f => <th key={f.key} className="px-3 py-3 text-left whitespace-nowrap bg-slate-50">{f.label}</th>)}<th className="px-3 py-3 text-right sticky right-0 bg-slate-50">操作</th></tr></thead>
                <tbody>{visibleRows.map((row, index) => <tr key={`${row[config.primaryKey]}-${index}`} className="border-t border-slate-100 hover:bg-cyan-50/40">{config.table === 'repair_reports' && <td className="px-3 py-2"><input type="checkbox" aria-label={`選取案件 ${displayValue(row[config.primaryKey])}`} checked={selectedRepairIds.has(String(row[config.primaryKey]))} onChange={() => toggleRepairSelection(row[config.primaryKey])} /></td>}{config.fields.filter(f => f.type !== 'json').map(field => {
                  const fieldValue = repairPhotoUrl(row, field);
                  const isRepairPhoto = config.table === 'repair_reports' && (field.key === 'before_photo_url' || field.key === 'after_photo_url');
                  const photoLabel = field.key === 'before_photo_url' ? '維修前照片' : '維修後照片';
                  const photoAlt = `路燈 ${displayValue(row.streetlight_id)} ${photoLabel}`;
                  return <td key={field.key} className="px-3 py-2 max-w-[260px] truncate whitespace-nowrap" title={displayFieldValue(fieldValue, field.type)}>{isRepairPhoto && fieldValue ? <RepairPhotoThumbnail url={String(fieldValue)} alt={photoAlt} onOpen={() => setPhotoPreview({ url: previewPhotoUrl(fieldValue), alt: photoAlt })} /> : isRepairPhoto ? <span className="text-xs text-slate-400">尚未上傳照片</span> : field.type === 'url' && fieldValue ? <a href={String(fieldValue)} target="_blank" rel="noreferrer" className="text-cyan-700 underline">開啟連結</a> : displayFieldValue(fieldValue, field.type)}</td>;
                })}<td className="px-3 py-2 sticky right-0 bg-white whitespace-nowrap text-right"><button onClick={() => openEdit(row)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="編輯"><Edit3 className="w-4 h-4" /></button><button onClick={() => remove(row)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="刪除"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => changePage(page - 1)} className="px-4 py-2 border rounded-lg disabled:opacity-30 font-bold">上一頁</button><label className="text-sm flex items-center gap-1">第 <select value={page} onChange={e => changePage(Number(e.target.value))} className="px-2 py-1.5 text-center border rounded-lg">{Array.from({ length: pageCount }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>／{pageCount} 頁</label><button disabled={page >= pageCount} onClick={() => changePage(page + 1)} className="px-4 py-2 border rounded-lg disabled:opacity-30 font-bold">下一頁</button></div>
        </section>

        {config.table === 'repair_reports' && <section className="hidden print:block print-report text-black">
          <header className="print-report__header">
            <h1>路燈報修／查修案件清冊</h1>
            <p>通報時間：{printPeriod}　列印時間：{printDate(new Date().toISOString())}　共 {filtered.length.toLocaleString()} 筆</p>
          </header>
          {filtered.length === 0 ? <p>此時間區間沒有報修／查修案件。</p> : <table className="print-report__table">
            <thead><tr><th>通報時間</th><th>路燈編號</th><th>故障情形</th><th>維修情形</th><th>完成時間</th><th>備註</th><th>維修前照片連結</th><th>維修後照片連結</th><th>通報人</th></tr></thead>
            <tbody>{filtered.map((row, index) => {
              const beforeUrl = repairPhotoUrl(row, { key: 'before_photo_url', label: '' });
              const afterUrl = repairPhotoUrl(row, { key: 'after_photo_url', label: '' });
              return <tr key={`${row.id}-${index}`}><td>{printDate(row.reported_at)}</td><td>{displayValue(row.streetlight_id)}</td><td>{displayValue(row.fault)}</td><td>{displayValue(row.status)}</td><td>{printDate(row.repaired_at)}</td><td>{displayValue(row.note)}</td><td>{beforeUrl ? <img src={previewPhotoUrl(beforeUrl)} alt={`路燈 ${displayValue(row.streetlight_id)} 維修前`} /> : '未提供照片'}</td><td>{afterUrl ? <img src={previewPhotoUrl(afterUrl)} alt={`路燈 ${displayValue(row.streetlight_id)} 維修後`} /> : '未提供照片'}</td><td>{displayValue(row.reporter_name)}</td></tr>;
            })}</tbody>
          </table>}
        </section>}
      </main>

      {editing && <div className="fixed inset-0 z-[3000] bg-slate-950/60 p-3 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b flex items-center"><h2 className="font-black text-lg">{isNew ? '新增' : '編輯'}{config.label}</h2><button onClick={() => setEditing(null)} className="ml-auto p-2 rounded-lg hover:bg-slate-100"><X /></button></div>
          <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.fields.filter(field => config.table !== 'repair_reports' || !['reported_at', 'streetlight_id', 'created_at', 'metadata'].includes(field.key)).map(field => <label key={field.key} className={field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2' : ''}><span className="block text-sm font-bold text-slate-600 mb-1">{field.label}{field.required && <span className="text-red-500"> *</span>}</span>{config.table === 'repair_reports' && field.key === 'fault' ? <select value={editing[field.key] ?? ''} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-white"><option value="" disabled>請選擇故障情形</option>{!FAULT_OPTIONS.includes(editing[field.key] ?? '') && editing[field.key] && <option value={editing[field.key]}>{editing[field.key]}（目前紀錄）</option>}{FAULT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}</select> : config.table === 'repair_reports' && field.key === 'status' ? <select value={editing[field.key] ?? ''} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl bg-white"><option value="未查修">未查修</option><option value="已查修">已查修</option></select> : field.type === 'textarea' || field.type === 'json' ? <textarea rows={field.type === 'json' ? 8 : 3} value={editing[field.key] ?? ''} disabled={field.readonly} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl font-mono text-sm disabled:bg-slate-100" /> : <input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'url' ? 'url' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={editing[field.key] ?? ''} disabled={field.readonly || (!isNew && field.key === config.primaryKey)} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl disabled:bg-slate-100" />}</label>)}
          </div>
          <div className="px-5 py-4 border-t flex justify-end gap-2"><button onClick={() => setEditing(null)} className="px-4 py-2 border rounded-xl">取消</button><button onClick={save} disabled={saving} className="px-5 py-2 bg-cyan-600 text-white rounded-xl font-bold disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button></div>
        </div>
      </div>}
      {photoPreview && <div className="fixed inset-0 z-[3100] bg-slate-950/85 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label={photoPreview.alt} onMouseDown={e => { if (e.target === e.currentTarget) setPhotoPreview(null); }}>
        <div className="relative max-h-full max-w-5xl">
          <button type="button" onClick={() => setPhotoPreview(null)} className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 text-slate-800 shadow-lg hover:bg-slate-100" aria-label="關閉照片"><X className="h-5 w-5" /></button>
          <img src={photoPreview.url} alt={photoPreview.alt} className="max-h-[90vh] max-w-full rounded-xl object-contain shadow-2xl" />
        </div>
      </div>}
    </div>
  );
}
