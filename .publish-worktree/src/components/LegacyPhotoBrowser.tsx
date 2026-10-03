import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Box, ClipboardList, Database, FolderKanban, Images, Image as ImageIcon, Lightbulb, LoaderCircle, Search, X } from 'lucide-react';

type Light = {
  lampId: number; lampNo: string; village?: string; street?: string; lane?: string;
  alley?: string; addressNo?: string; fullAddress?: string; poleType?: string;
  neighborhood?: string; direction?: string; addressDetail?: string; fixturePosition?: string;
  height?: string; material?: string; armMaterial?: string; watt?: string; fixtureCount?: number;
  addressMemo?: string; note?: string; maintenanceArea?: string; circuit?: string;
  lampStatus?: number; longitude?: number; latitude?: number; updatedAt?: string;
  photoCount: number; originalPhotoCount: number;
};
type Photo = { source: 'current' | 'original'; imageId: number; imageName: string; bytes?: number; lampNo?: string; lampId?: number };
type LightCard = Light & { photos: Photo[] };
type DataPage = 'lights' | 'boxes' | 'repairs' | 'projects' | 'tables';

const photoUrl = (photo: Photo) => `/api/photos/${photo.source}/${photo.imageId}`;
const number = new Intl.NumberFormat('zh-TW');

function value(value: unknown) { return value === null || value === undefined || value === '' ? '—' : String(value); }

export default function LegacyPhotoBrowser({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Light[]>([]);
  const [selected, setSelected] = useState<Light | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Photo | null>(null);
  const [gallery, setGallery] = useState<LightCard[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryHasMore, setGalleryHasMore] = useState(true);
  const [showGallery, setShowGallery] = useState(true);
  const [activePage, setActivePage] = useState<DataPage>('lights');
  const [dataRows, setDataRows] = useState<Record<string, unknown>[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState('');
  const [tableColumns, setTableColumns] = useState<Array<{ columnName: string; dataType: string }>>([]);
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [tableHasMore, setTableHasMore] = useState(false);

  const loadGallery = async (reset = false) => {
    if (galleryLoading || (!reset && !galleryHasMore)) return;
    setGalleryLoading(true); setError('');
    const offset = reset ? 0 : gallery.length;
    try {
      const response = await fetch(`/api/all-lights?offset=${offset}&limit=40`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setGallery(reset ? data.items : (current) => [...current, ...data.items]);
      setGalleryHasMore(data.hasMore);
    } catch { setError('讀取所有照片時發生問題。'); }
    finally { setGalleryLoading(false); }
  };

  const runSearch = async (value = query) => {
    setLoading(true); setError(''); setSelected(null); setPhotos([]); setShowGallery(String(value).trim().length === 0);
    try {
      const response = await fetch(`/api/lights?q=${encodeURIComponent(value)}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setItems(data.items);
    } catch { setError('無法連線到本機照片資料庫。請確認瀏覽器是由照片瀏覽器啟動。'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void runSearch(''); void loadGallery(true); }, []);

  const switchPage = async (page: DataPage) => {
    setActivePage(page); setSelected(null); setError('');
    if (page === 'lights') return;
    setDataLoading(true); setDataRows([]);
    setSelectedTable(''); setTableColumns([]); setTableRows([]); setTableHasMore(false);
    try {
      const response = await fetch(`/api/${page}`);
      if (!response.ok) throw new Error();
      setDataRows((await response.json()).items);
    } catch { setError('讀取資料時發生問題。'); }
    finally { setDataLoading(false); }
  };

  const loadTable = async (tableName: string, append = false) => {
    setDataLoading(true); setError('');
    if (!append) { setSelectedTable(tableName); setTableColumns([]); setTableRows([]); setTableHasMore(false); }
    try {
      const offset = append ? tableRows.length : 0;
      const response = await fetch(`/api/tables/${encodeURIComponent(tableName)}?offset=${offset}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setTableColumns(data.columns); setTableRows(append ? (current) => [...current, ...data.rows] : data.rows); setTableHasMore(data.hasMore);
    } catch { setError('讀取資料表時發生問題。'); }
    finally { setDataLoading(false); }
  };

  const chooseLight = async (light: Light) => {
    setSelected(light); setPhotos([]); setPhotoLoading(true); setError(''); setShowGallery(false);
    try {
      const response = await fetch(`/api/lights/${light.lampId}/photos`);
      if (!response.ok) throw new Error();
      setPhotos((await response.json()).items);
    } catch { setError('讀取照片清單時發生問題。'); }
    finally { setPhotoLoading(false); }
  };

  const address = useMemo(() => selected?.fullAddress || [selected?.village, selected?.street, selected?.lane, selected?.alley, selected?.addressNo].filter(Boolean).join(''), [selected]);

  return <main className="min-h-screen bg-slate-100 text-slate-800">
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-6">
        <div className="rounded-xl bg-amber-100 p-2 text-amber-700"><ImageIcon size={24} /></div>
        <div className="flex-1"><h1 className="text-lg font-bold sm:text-xl">三義鄉路燈歷史照片瀏覽器</h1><p className="text-xs text-slate-500">資料來源：sanyi20201216 備份資料庫（僅讀取）</p></div>
        <button onClick={onBack} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"><ArrowLeft size={17} />返回系統</button>
      </div>
      <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
        {([['lights', '路燈資料', Lightbulb], ['boxes', '配電箱', Box], ['repairs', '維修通報', ClipboardList], ['projects', '工程／廠商', FolderKanban], ['tables', '其他資料', Database]] as const).map(([page, label, Icon]) => <button key={page} onClick={() => void switchPage(page)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${activePage === page ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={16} />{label}</button>)}
      </nav>
    </header>
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      {activePage === 'lights' && <>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="燈號、村別、路段或地址" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          <button className="rounded-xl bg-amber-500 px-3 text-white hover:bg-amber-600" title="搜尋"><Search size={20} /></button>
        </form>
        <button onClick={() => { setSelected(null); setShowGallery(true); void loadGallery(gallery.length === 0); }} className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium ${showGallery ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}><Images size={18} />顯示所有路燈</button>
        {!showGallery && <div className="mt-3 text-sm text-slate-500">{loading ? '搜尋中…' : `找到 ${number.format(items.length)} 支路燈（最多顯示 60 筆）`}</div>}
      </section>
      <section className="mt-5 min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {showGallery && <><div className="border-b border-slate-100 pb-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">所有路燈</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">已載入 {number.format(gallery.length)} 支</span></div><p className="mt-2 text-sm text-slate-500">每列是一支路燈；點選文字欄位可查看完整資料，點選照片可放大。</p></div><div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><div className="min-w-[1180px]"><div className="grid grid-cols-[100px_90px_minmax(220px,1fr)_110px_110px_75px_75px_75px_250px] gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600"><div>路燈號碼</div><div>村別</div><div>地址</div><div>燈桿</div><div>材質</div><div>瓦數</div><div>高度</div><div>狀態</div><div>照片（最多 3 張）</div></div>{gallery.map((light) => <div key={light.lampId} className="grid grid-cols-[100px_90px_minmax(220px,1fr)_110px_110px_75px_75px_75px_250px] items-center gap-3 border-b border-slate-200 px-4 py-3 text-sm last:border-b-0 hover:bg-amber-50"><button onClick={() => void chooseLight(light)} className="text-left font-bold text-slate-800 hover:text-amber-700">{light.lampNo || '未編號'}</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.village)}</button><button onClick={() => void chooseLight(light)} className="truncate text-left text-slate-700" title={light.fullAddress}>{light.fullAddress || [light.village, light.street, light.addressNo].filter(Boolean).join('') || '未登錄地址'}</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.poleType)}</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.material)}</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.watt)} W</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.height)}</button><button onClick={() => void chooseLight(light)} className="text-left text-slate-700">{value(light.lampStatus)}</button><div className="grid grid-cols-3 gap-1">{light.photos.length > 0 ? light.photos.map((photo) => <button key={photo.imageId} onClick={() => setPreview(photo)} className="overflow-hidden rounded border border-slate-200 bg-slate-100"><img src={photoUrl(photo)} alt={photo.imageName} loading="lazy" className="aspect-square w-full object-cover" /></button>) : <span className="col-span-3 py-3 text-center text-xs text-slate-400">沒有照片</span>}</div></div>)}</div></div>{galleryLoading ? <div className="flex justify-center gap-2 py-8 text-slate-500"><LoaderCircle className="animate-spin" />載入路燈…</div> : galleryHasMore ? <div className="pt-6 text-center"><button onClick={() => void loadGallery()} className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600">載入更多路燈</button></div> : <p className="py-8 text-center text-sm text-slate-500">已顯示所有路燈。</p>}</>}
        {!selected && !showGallery && <>{loading ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin" />搜尋中…</div> : <div className="space-y-2">{items.map((light) => <button key={light.lampId} onClick={() => void chooseLight(light)} className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-amber-400 hover:bg-amber-50"><div className="min-w-0"><strong>{light.lampNo || '未編號'}</strong><p className="mt-1 truncate text-sm text-slate-600">{light.fullAddress || [light.village, light.street, light.addressNo].filter(Boolean).join('') || '未登錄地址'}</p><p className="mt-1 text-xs text-slate-500">{value(light.poleType)} · {value(light.watt)} W · 高度 {value(light.height)}</p></div><span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{light.photoCount} / 3 張</span></button>)}</div>}</>}
        {selected && <><div className="border-b border-slate-100 pb-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{selected.lampNo}</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{photos.length} 張照片</span></div><p className="mt-2 text-slate-600">{address || '未登錄地址'}</p><p className="mt-1 text-sm text-slate-500">{[selected.poleType, selected.watt && `${selected.watt} W`].filter(Boolean).join(' · ')}</p></div><div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-3"><div><p className="text-xs text-slate-500">村別／鄰別</p><p>{value(selected.village)}／{value(selected.neighborhood)}</p></div><div><p className="text-xs text-slate-500">燈桿型式／材質</p><p>{value(selected.poleType)}／{value(selected.material)}</p></div><div><p className="text-xs text-slate-500">瓦數／高度</p><p>{value(selected.watt)} W／{value(selected.height)}</p></div><div><p className="text-xs text-slate-500">燈具位置／數量</p><p>{value(selected.fixturePosition)}／{value(selected.fixtureCount)}</p></div><div><p className="text-xs text-slate-500">迴路／維護區</p><p>{value(selected.circuit)}／{value(selected.maintenanceArea)}</p></div><div><p className="text-xs text-slate-500">狀態／更新日期</p><p>{value(selected.lampStatus)}／{value(selected.updatedAt)}</p></div><div className="col-span-2 sm:col-span-3"><p className="text-xs text-slate-500">座標</p><p>{value(selected.longitude)}, {value(selected.latitude)}</p></div>{selected.addressMemo && <div className="col-span-2 sm:col-span-3"><p className="text-xs text-slate-500">地址備註</p><p>{selected.addressMemo}</p></div>}{selected.note && <div className="col-span-2 sm:col-span-3"><p className="text-xs text-slate-500">備註</p><p>{selected.note}</p></div>}</div>
          {photoLoading ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin" />讀取照片…</div> : photos.length === 0 ? <div className="p-12 text-center text-slate-500">此路燈沒有可顯示的照片。</div> : <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{photos.map((photo) => <button key={`${photo.source}-${photo.imageId}`} onClick={() => setPreview(photo)} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left hover:border-amber-400 hover:shadow-md"><img src={photoUrl(photo)} alt={photo.imageName} loading="lazy" className="aspect-square w-full object-cover transition duration-200 group-hover:scale-105" /><div className="p-2"><p className="truncate text-sm font-medium">{photo.imageName}</p><p className="text-xs text-slate-500">{photo.source === 'original' ? '原始影像' : '系統影像'} · {Math.round((photo.bytes || 0) / 1024)} KB</p></div></button>)}</div>}
        </>}
      </section>
      </>}
      {activePage === 'tables' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-xl font-bold">其他資料表</h2><p className="mt-1 text-sm text-slate-500">選擇資料表即可查看欄位與前 500 筆資料；照片等二進位欄位僅顯示大小。</p></div>
        {dataLoading ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin" />載入資料…</div> : !selectedTable ? <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">{dataRows.map((row) => <button key={String(row.tableName)} onClick={() => void loadTable(String(row.tableName))} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-3 text-left hover:border-amber-400 hover:bg-amber-50"><span className="font-medium">{String(row.tableName)}</span><span className="text-xs text-slate-500">{number.format(Number(row.rowCount || 0))} 筆</span></button>)}</div> : <div><div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3"><button onClick={() => { setSelectedTable(''); setTableColumns([]); setTableRows([]); setTableHasMore(false); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">← 所有資料表</button><strong>{selectedTable}</strong><span className="text-sm text-slate-500">欄位 {tableColumns.length} 個，已載入 {number.format(tableRows.length)} 筆</span></div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{tableColumns.map((column) => <th key={column.columnName} className="whitespace-nowrap px-4 py-3 font-semibold">{column.columnName}<span className="ml-1 font-normal text-slate-400">{column.dataType}</span></th>)}</tr></thead><tbody className="divide-y divide-slate-200">{tableRows.map((row, index) => <tr key={index} className="hover:bg-amber-50">{tableColumns.map((column) => <td key={column.columnName} className="max-w-xs px-4 py-3 align-top text-slate-700">{value(row[column.columnName])}</td>)}</tr>)}</tbody></table>{tableRows.length === 0 && <p className="p-10 text-center text-slate-500">沒有資料。</p>}</div>{tableHasMore && <div className="border-t border-slate-200 p-4 text-center"><button onClick={() => void loadTable(selectedTable, true)} className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600">載入更多資料</button></div>}</div>}
      </section>}
      {activePage !== 'lights' && activePage !== 'tables' && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4"><h2 className="text-xl font-bold">{activePage === 'boxes' ? '配電箱資料' : activePage === 'repairs' ? '維修通報紀錄' : '工程／廠商資料'}</h2><p className="mt-1 text-sm text-slate-500">共 {number.format(dataRows.length)} 筆資料</p></div>
        {dataLoading ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin" />載入資料…</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-100 text-xs text-slate-600"><tr>{(activePage === 'boxes' ? ['箱號','村別','地址','型式','高度','主支線','狀態','更新日期','備註'] : activePage === 'repairs' ? ['通報單號','路燈號碼','項目','通報日期','地址','期限','完工日期','狀態','內容'] : ['年度','工程編號','工程名稱','廠商','金額','開工日','完工日','工期','狀態']).map((title) => <th key={title} className="whitespace-nowrap px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody className="divide-y divide-slate-200">{dataRows.map((row, index) => { const cells = activePage === 'boxes' ? [row.boxNo,row.village,row.address || row.street,row.boxType,row.height,row.mainBranch,row.boxStatus,row.updatedAt,row.memo] : activePage === 'repairs' ? [row.repairNo,row.lampNo,row.repairItem,row.reportedAt,row.address,row.dueDate,row.finishedAt,row.checkStatus,row.memo] : [row.projectYear,row.projectNo,row.projectName,row.companyName,row.projectAmount,row.startedAt,row.endedAt,row.workDays,row.projectStatus]; return <tr key={String(row.boxId || row.repairId || row.projectId || index)} className="hover:bg-amber-50">{cells.map((cell, cellIndex) => <td key={cellIndex} className="max-w-xs px-4 py-3 align-top text-slate-700">{value(cell)}</td>)}</tr>; })}</tbody></table>{!dataLoading && dataRows.length === 0 && <p className="p-10 text-center text-slate-500">沒有資料。</p>}</div>}
      </section>}
    </div>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4" onClick={() => setPreview(null)}><div className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}><button onClick={() => setPreview(null)} className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 text-slate-700 shadow"><X size={20} /></button><img src={photoUrl(preview)} alt={preview.imageName} className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl" /><p className="mt-2 text-center text-sm text-white">{preview.imageName}</p></div></div>}
    {error && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-rose-700 px-4 py-3 text-sm text-white shadow-lg">{error}</div>}
  </main>;
}
