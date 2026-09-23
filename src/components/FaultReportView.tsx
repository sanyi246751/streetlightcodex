import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, Lightbulb, LoaderCircle, Phone, UserRound } from 'lucide-react';
import { createRepairReport, getStreetlights } from '../services/database';

export default function FaultReportView({ onBack }: { onBack: () => void }) {
  const [streetlightId, setStreetlightId] = useState('');
  const [faultType, setFaultType] = useState('路燈不亮');
  const [faultDetail, setFaultDetail] = useState('');
  const [reporterName, setReporterName] = useState('');
  const [phone, setPhone] = useState('');
  const [lightIds, setLightIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getStreetlights()
      .then(rows => setLightIds(rows.map(row => String(row['原路燈號碼'] || '')).filter(Boolean)))
      .catch(() => setLightIds([]));
  }, []);

  const knownLight = useMemo(
    () => !streetlightId.trim() || lightIds.length === 0 || lightIds.includes(streetlightId.trim()),
    [lightIds, streetlightId]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!streetlightId.trim() || !faultType) return;
    if (!knownLight) {
      setError('查無此路燈編號，請確認燈桿上的編號後再送出。');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const fault = faultDetail.trim() ? `${faultType}：${faultDetail.trim()}` : faultType;
      await createRepairReport({ streetlightId, fault, reporterName, phone });
      setSubmitted(true);
    } catch (submitError) {
      console.error('[FaultReport] Submit failed:', submitError);
      setError('通報送出失敗，請檢查網路後再試一次。');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-[100dvh] bg-sky-50 px-5 py-10 flex items-center justify-center">
        <section className="w-full max-w-lg rounded-[2rem] bg-white p-8 text-center shadow-xl border border-sky-100">
          <CheckCircle2 className="mx-auto h-20 w-20 text-emerald-500" />
          <h1 className="mt-5 text-2xl font-black text-slate-800">通報已成功送出</h1>
          <p className="mt-3 text-slate-500">路燈 {streetlightId.trim()} 已加入未查修清單。</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button onClick={() => { setSubmitted(false); setStreetlightId(''); setFaultDetail(''); }} className="rounded-2xl bg-sky-600 px-5 py-3 font-bold text-white hover:bg-sky-700">繼續通報</button>
            <button onClick={onBack} className="rounded-2xl bg-slate-100 px-5 py-3 font-bold text-slate-700 hover:bg-slate-200">返回路燈地圖</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] overflow-y-auto bg-sky-50 px-4 py-6 sm:py-10">
      <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-[2rem] bg-white shadow-xl border border-sky-100">
        <header className="bg-sky-600 px-5 py-5 text-white sm:px-8">
          <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25">
            <ChevronLeft className="h-4 w-4" /> 返回路燈地圖
          </button>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/20 p-3"><Lightbulb className="h-8 w-8" /></div>
            <div><h1 className="text-2xl font-black">路燈故障通報</h1><p className="mt-1 text-sm text-sky-100">請填寫燈桿編號與故障狀況</p></div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 p-5 sm:p-8">
          <label className="block">
            <span className="mb-2 block font-bold text-slate-700">路燈編號 <span className="text-red-500">*</span></span>
            <input list="streetlight-ids" value={streetlightId} onChange={e => { setStreetlightId(e.target.value); setError(''); }} required placeholder="例如：001" className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 text-lg outline-none focus:border-sky-500" />
            <datalist id="streetlight-ids">{lightIds.map(id => <option value={id} key={id} />)}</datalist>
            {!knownLight && <span className="mt-2 block text-sm font-medium text-amber-600">目前查無此路燈編號</span>}
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 font-bold text-slate-700"><AlertTriangle className="h-5 w-5 text-amber-500" />故障情形 <span className="text-red-500">*</span></span>
            <select value={faultType} onChange={e => setFaultType(e.target.value)} required className="w-full rounded-2xl border-2 border-slate-200 bg-white px-4 py-3 outline-none focus:border-sky-500">
              <option>路燈不亮</option><option>路燈閃爍</option><option>白天仍亮</option><option>燈具損壞</option><option>燈桿傾斜或損壞</option><option>電線外露</option><option>其他</option>
            </select>
            <textarea value={faultDetail} onChange={e => setFaultDetail(e.target.value)} rows={3} placeholder="補充位置或故障狀況（選填）" className="mt-3 w-full resize-none rounded-2xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-sky-500" />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block"><span className="mb-2 flex items-center gap-2 font-bold text-slate-700"><UserRound className="h-5 w-5 text-sky-500" />通報人</span><input value={reporterName} onChange={e => setReporterName(e.target.value)} placeholder="姓名（選填）" className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-sky-500" /></label>
            <label className="block"><span className="mb-2 flex items-center gap-2 font-bold text-slate-700"><Phone className="h-5 w-5 text-sky-500" />聯絡電話</span><input type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="電話（選填）" className="w-full rounded-2xl border-2 border-slate-200 px-4 py-3 outline-none focus:border-sky-500" /></label>
          </div>

          {error && <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 font-medium text-red-600">{error}</div>}
          <button disabled={submitting || !streetlightId.trim()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-4 text-lg font-black text-white shadow-lg hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting && <LoaderCircle className="h-5 w-5 animate-spin" />}{submitting ? '送出中…' : '送出故障通報'}
          </button>
          <p className="text-center text-xs leading-5 text-slate-400">送出後資料將提供承辦及維修人員進行查修。</p>
        </form>
      </section>
    </main>
  );
}
