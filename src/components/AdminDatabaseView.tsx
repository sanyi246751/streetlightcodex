import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Database, Edit3, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { supabaseDelete, supabaseInsert, supabaseSelectAll, supabaseUpdate } from '../lib/supabase';

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
      { key: 'metadata', label: '原始資料', type: 'json' },
      { key: 'created_at', label: '建立時間', type: 'datetime', readonly: true },
      { key: 'updated_at', label: '更新時間', type: 'datetime', readonly: true }
    ]
  },
  {
    table: 'repair_reports', label: '報修／查修', primaryKey: 'id', order: 'reported_at.desc', fields: [
      { key: 'id', label: '流水號', readonly: true },
      { key: 'streetlight_id', label: '路燈編號', required: true },
      { key: 'reported_at', label: '通報時間', type: 'datetime', required: true },
      { key: 'fault', label: '故障情形', type: 'textarea' }, { key: 'status', label: '維修情形', required: true },
      { key: 'repaired_at', label: '完成時間', type: 'datetime' }, { key: 'note', label: '備註', type: 'textarea' },
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
const displayValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

export default function AdminDatabaseView({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState(TABLES[0]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    setLoading(true); setError('');
    try {
      setRows(await supabaseSelectAll<Record<string, any>>(config.table, `select=*&order=${config.order}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : '讀取資料失敗');
      setRows([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); setQuery(''); loadRows(); }, [config]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(row => config.fields.some(field => displayValue(row[field.key]).toLowerCase().includes(keyword)));
  }, [rows, query, config]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 overflow-auto">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10" aria-label="返回地圖"><ChevronLeft /></button>
          <Database className="text-cyan-400" />
          <div><h1 className="font-black text-lg">資料庫管理</h1><p className="text-xs text-slate-400">Supabase 全資料閱覽與編輯</p></div>
          <button onClick={loadRows} disabled={loading} className="ml-auto p-2 rounded-xl hover:bg-white/10 disabled:opacity-50" aria-label="重新整理"><RefreshCw className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-3 md:p-6">
        <div className="flex gap-2 overflow-x-auto pb-3">
          {TABLES.map(item => <button key={item.table} onClick={() => setConfig(item)} className={`px-4 py-2.5 rounded-xl font-bold whitespace-nowrap ${config.table === item.table ? 'bg-cyan-600 text-white shadow' : 'bg-white text-slate-600 border border-slate-200'}`}>{item.label}</button>)}
        </div>

        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-3 border-b border-slate-200 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <div className="relative flex-1 max-w-xl"><Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" /><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={`搜尋${config.label}的所有欄位`} className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-cyan-500" /></div>
            <span className="text-sm text-slate-500 sm:ml-auto">共 {filtered.length.toLocaleString()} 筆</span>
            <button onClick={openCreate} className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" />新增資料</button>
          </div>

          {error && <div className="m-3 p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-sm break-all">{error}</div>}
          <div className="overflow-x-auto min-h-[360px]">
            {loading ? <div className="p-16 text-center text-slate-500">資料載入中…</div> : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600"><tr>{config.fields.filter(f => f.type !== 'json').map(f => <th key={f.key} className="px-3 py-3 text-left whitespace-nowrap">{f.label}</th>)}<th className="px-3 py-3 text-right sticky right-0 bg-slate-50">操作</th></tr></thead>
                <tbody>{visibleRows.map((row, index) => <tr key={`${row[config.primaryKey]}-${index}`} className="border-t border-slate-100 hover:bg-cyan-50/40">{config.fields.filter(f => f.type !== 'json').map(field => <td key={field.key} className="px-3 py-2 max-w-[260px] truncate whitespace-nowrap" title={displayValue(row[field.key])}>{field.type === 'url' && row[field.key] ? <a href={row[field.key]} target="_blank" rel="noreferrer" className="text-cyan-700 underline">開啟連結</a> : displayValue(row[field.key])}</td>)}<td className="px-3 py-2 sticky right-0 bg-white whitespace-nowrap text-right"><button onClick={() => openEdit(row)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="編輯"><Edit3 className="w-4 h-4" /></button><button onClick={() => remove(row)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="刪除"><Trash2 className="w-4 h-4" /></button></td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="p-3 border-t border-slate-200 flex items-center justify-center gap-3"><button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-30">上一頁</button><span className="text-sm">第 {page}／{pageCount} 頁</span><button disabled={page >= pageCount} onClick={() => setPage(p => p + 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-30">下一頁</button></div>
        </section>
      </main>

      {editing && <div className="fixed inset-0 z-[3000] bg-slate-950/60 p-3 flex items-center justify-center" onMouseDown={e => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b flex items-center"><h2 className="font-black text-lg">{isNew ? '新增' : '編輯'}{config.label}</h2><button onClick={() => setEditing(null)} className="ml-auto p-2 rounded-lg hover:bg-slate-100"><X /></button></div>
          <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.fields.map(field => <label key={field.key} className={field.type === 'textarea' || field.type === 'json' ? 'md:col-span-2' : ''}><span className="block text-sm font-bold text-slate-600 mb-1">{field.label}{field.required && <span className="text-red-500"> *</span>}</span>{field.type === 'textarea' || field.type === 'json' ? <textarea rows={field.type === 'json' ? 8 : 3} value={editing[field.key] ?? ''} disabled={field.readonly} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl font-mono text-sm disabled:bg-slate-100" /> : <input type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type === 'url' ? 'url' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={editing[field.key] ?? ''} disabled={field.readonly || (!isNew && field.key === config.primaryKey)} onChange={e => setEditing({ ...editing, [field.key]: e.target.value })} className="w-full px-3 py-2 border rounded-xl disabled:bg-slate-100" />}</label>)}
          </div>
          <div className="px-5 py-4 border-t flex justify-end gap-2"><button onClick={() => setEditing(null)} className="px-4 py-2 border rounded-xl">取消</button><button onClick={save} disabled={saving} className="px-5 py-2 bg-cyan-600 text-white rounded-xl font-bold disabled:opacity-50">{saving ? '儲存中…' : '儲存'}</button></div>
        </div>
      </div>}
    </div>
  );
}
