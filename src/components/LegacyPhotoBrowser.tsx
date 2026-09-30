import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Image as ImageIcon, LoaderCircle, Search, X } from 'lucide-react';

type Light = {
  lampId: number; lampNo: string; village?: string; street?: string; lane?: string;
  alley?: string; addressNo?: string; fullAddress?: string; poleType?: string;
  watt?: string; photoCount: number; originalPhotoCount: number;
};
type Photo = { source: 'current' | 'original'; imageId: number; imageName: string; bytes: number };

const photoUrl = (photo: Photo) => `/api/photos/${photo.source}/${photo.imageId}`;
const number = new Intl.NumberFormat('zh-TW');

export default function LegacyPhotoBrowser({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Light[]>([]);
  const [selected, setSelected] = useState<Light | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Photo | null>(null);

  const runSearch = async (value = query) => {
    setLoading(true); setError(''); setSelected(null); setPhotos([]);
    try {
      const response = await fetch(`/api/lights?q=${encodeURIComponent(value)}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setItems(data.items);
    } catch { setError('無法連線到本機照片資料庫。請確認瀏覽器是由照片瀏覽器啟動。'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void runSearch(''); }, []);

  const chooseLight = async (light: Light) => {
    setSelected(light); setPhotos([]); setPhotoLoading(true); setError('');
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
    </header>
    <div className="mx-auto grid max-w-7xl gap-5 p-4 sm:p-6 lg:grid-cols-[390px_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-5 lg:h-[calc(100vh-80px)] lg:overflow-auto">
        <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="燈號、村別、路段或地址" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" />
          <button className="rounded-xl bg-amber-500 px-3 text-white hover:bg-amber-600" title="搜尋"><Search size={20} /></button>
        </form>
        <div className="mt-3 text-sm text-slate-500">{loading ? '搜尋中…' : `找到 ${number.format(items.length)} 筆（最多顯示 60 筆）`}</div>
        <div className="mt-3 space-y-2">
          {loading && <div className="flex justify-center p-8"><LoaderCircle className="animate-spin text-amber-500" /></div>}
          {!loading && items.map((light) => <button key={light.lampId} onClick={() => void chooseLight(light)} className={`w-full rounded-xl border p-3 text-left transition ${selected?.lampId === light.lampId ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300' : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/50'}`}>
            <div className="flex items-center justify-between gap-2"><strong>{light.lampNo || '未編號'}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{light.photoCount + light.originalPhotoCount} 張</span></div>
            <div className="mt-1 text-sm text-slate-600">{light.fullAddress || [light.village, light.street, light.addressNo].filter(Boolean).join('')}</div>
          </button>)}
        </div>
      </section>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {!selected && <div className="flex min-h-80 flex-col items-center justify-center text-center text-slate-500"><ImageIcon size={42} className="mb-3 text-slate-300" /><p className="font-medium">從左側選擇一支路燈</p><p className="mt-1 text-sm">可搜尋燈號、村別、路段或完整地址。</p></div>}
        {selected && <><div className="border-b border-slate-100 pb-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold">{selected.lampNo}</h2><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">{photos.length} 張照片</span></div><p className="mt-2 text-slate-600">{address || '未登錄地址'}</p><p className="mt-1 text-sm text-slate-500">{[selected.poleType, selected.watt && `${selected.watt} W`].filter(Boolean).join(' · ')}</p></div>
          {photoLoading ? <div className="flex min-h-64 items-center justify-center gap-2 text-slate-500"><LoaderCircle className="animate-spin" />讀取照片…</div> : photos.length === 0 ? <div className="p-12 text-center text-slate-500">此路燈沒有可顯示的照片。</div> : <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{photos.map((photo) => <button key={`${photo.source}-${photo.imageId}`} onClick={() => setPreview(photo)} className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left hover:border-amber-400 hover:shadow-md"><img src={photoUrl(photo)} alt={photo.imageName} loading="lazy" className="aspect-square w-full object-cover transition duration-200 group-hover:scale-105" /><div className="p-2"><p className="truncate text-sm font-medium">{photo.imageName}</p><p className="text-xs text-slate-500">{photo.source === 'original' ? '原始影像' : '系統影像'} · {Math.round(photo.bytes / 1024)} KB</p></div></button>)}</div>}
        </>}
      </section>
    </div>
    {preview && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4" onClick={() => setPreview(null)}><div className="relative max-h-full max-w-6xl" onClick={(event) => event.stopPropagation()}><button onClick={() => setPreview(null)} className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-2 text-slate-700 shadow"><X size={20} /></button><img src={photoUrl(preview)} alt={preview.imageName} className="max-h-[88vh] max-w-full rounded-lg object-contain shadow-2xl" /><p className="mt-2 text-center text-sm text-white">{preview.imageName}</p></div></div>}
    {error && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-rose-700 px-4 py-3 text-sm text-white shadow-lg">{error}</div>}
  </main>;
}
