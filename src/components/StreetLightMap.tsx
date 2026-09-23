import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, LayersControl, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { StreetLightData, StreetLightLocation, RepairRecord } from '../types';
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '../constants';
import { getRepairRecords, getStreetlights } from '../services/database';
import { Search, AlertTriangle, Lightbulb, ExternalLink, X, Navigation, Settings, MapPin, ClipboardCheck, Database, House } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Fix for Leaflet default icon issues in React
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: 'unrepaired-marker'
});

const blueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const goldIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-gold.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  className: 'searched-marker',
  iconSize: [33, 53],
  iconAnchor: [16, 53],
  popupAnchor: [1, -44],
  shadowSize: [53, 53]
});

function parseTaiwanDateTime(twStr: string) {
  if (!twStr) return null;
  const cleaned = twStr.trim().replace(/\s+/g, ' ');

  // Supabase returns ISO 8601 timestamps, for example 2026-02-02T02:22:48+00:00.
  const standardDate = new Date(cleaned);
  if (!isNaN(standardDate.getTime())) return standardDate;

  // Standard format: "2024/3/12 下午 2:30:00" or "2024/3/12 14:30:00"
  let match = cleaned.match(/^(\d+\/\d+\/\d+)\s*(上午|下午)?\s*(\d+:\d+(?::\d+)?)/);

  if (!match) {
    // Try format without spaces: "2024/3/12下午2:30:00"
    match = cleaned.match(/^(\d+\/\d+\/\d+)(上午|下午)(\d+:\d+(?::\d+)?)/);
  }

  if (!match) return null;

  const datePart = match[1];
  const ampm = match[2];
  const timePart = match[3];

  const dateParts = datePart.split('/').map(Number);
  let year = dateParts[0];
  const month = dateParts[1];
  const day = dateParts[2];

  // Handle Minguo year if necessary (unlikely in modern sheets but safe)
  if (year < 1911 && year > 0) year += 1911;

  const timeParts = timePart.split(':').map(Number);
  let hour = timeParts[0];
  const minute = timeParts[1];
  const second = timeParts[2] || 0;

  if (ampm === '下午' && hour < 12) hour += 12;
  if (ampm === '上午' && hour === 12) hour = 0;

  const d = new Date(year, month - 1, day, hour, minute, second);
  return isNaN(d.getTime()) ? null : d;
}

// Component to handle map actions like flying to a location or fitting bounds
const MapController = ({ target, bounds }: { target: [number, number] | null, bounds: L.LatLngBoundsExpression | null }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target, 20, { duration: 1.5 });
    }
  }, [target, map]);

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }, [bounds, map]);
  return null;
};

// Memoized SearchBar component to prevent full map re-renders while typing
const SearchBar = React.memo(({ onSearch }: { onSearch: (id: string) => void }) => {
  const [inputValue, setInputValue] = useState('');

  const handleAction = () => {
    if (inputValue.trim()) {
      onSearch(inputValue.trim());
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur shadow-lg rounded-2xl p-2 flex items-center border border-slate-200">
      <Search className="w-5 h-5 text-slate-400 ml-2 shrink-0" />
      <input
        type="text"
        placeholder="輸入路燈編號"
        className="flex-1 px-3 py-2 bg-transparent outline-none text-slate-700 text-xs min-w-0"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAction()}
      />
      <button
        onClick={handleAction}
        className="bg-[#0080ffe8] hover:bg-[#0066cc] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors shrink-0"
      >
        查詢
      </button>
    </div>
  );
});

export default function StreetLightMap({
  onNavigateToReplace,
  onNavigateToReport,
  onNavigateToSurvey,
  onNavigateToDatabase,
  onNavigateToFaultReport,
  onBackHome,
  villageData,
  role
}: {
  onNavigateToReplace?: (data: StreetLightData[]) => void;
  onNavigateToReport?: () => void;
  onNavigateToSurvey?: () => void;
  onNavigateToDatabase?: () => void;
  onNavigateToFaultReport?: () => void;
  onBackHome?: () => void;
  villageData: any;
  role?: 'officer' | 'maintenance' | 'admin' | 'survey' | null;
}) {
  const [lights, setLights] = useState<StreetLightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(null);
  const [searchedLightId, setSearchedLightId] = useState<string | null>(null);
  const [showTooltips, setShowTooltips] = useState(true);
  const [unrepairedListOpen, setUnrepairedListOpen] = useState(true);

  const mapRef = useRef<L.Map | null>(null);

  const roleDisplay = {
    officer: { title: '承辦人員', color: 'bg-sky-600' },
    maintenance: { title: '維修人員', color: 'bg-emerald-600' },
    survey: { title: '路燈基座調查', color: 'bg-purple-600' },
    admin: { title: '管理單位', color: 'bg-orange-500' },
  }[role || 'officer'];

  useEffect(() => {
    async function fetchData() {
      try {
        const [locationRes, repairRes] = await Promise.all([
          getStreetlights(),
          getRepairRecords()
        ]);

        const unrepairedSet = new Set<string>();
        const reportTimeMap = new Map<string, Date>();
        const faultMap = new Map<string, string>();

        repairRes.forEach((row: RepairRecord) => {
          const lampID = row["路燈編號"]?.trim();
          const reportTimeStr = row["通報時間"]?.trim();
          const status = (row["維修情形"] || "").trim();
          const fault = (row["故障情形"] || "").trim();

          if (lampID) {
            if (status === "未查修") {
              unrepairedSet.add(lampID);
              const reportDate = parseTaiwanDateTime(reportTimeStr);
              if (reportDate && !isNaN(reportDate.getTime())) {
                reportTimeMap.set(lampID, reportDate);
              }
            }
            faultMap.set(lampID, fault);
          }
        });

        const processedLights: StreetLightData[] = locationRes
          .map((row: StreetLightLocation) => {
            const id = row["原路燈號碼"]?.trim();
            const lat = parseFloat(row["緯度Latitude"]);
            const lng = parseFloat(row["經度Longitude"]);

            if (!id || isNaN(lat) || isNaN(lng)) return null;

            return {
              ...row,
              id,
              lat,
              lng,
              isUnrepaired: unrepairedSet.has(id),
              fault: faultMap.get(id) || "",
              reportDate: reportTimeMap.get(id)
            };
          })
          .filter(Boolean) as StreetLightData[];

        setLights(processedLights);
        // 初始不設定單一點目標，改由 fitBounds 框選所有路燈範圍
        setTargetLocation(null);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const unrepairedLights = useMemo(() =>
    lights
      .filter(l => l.isUnrepaired)
      .sort((a, b) => {
        const timeA = a.reportDate?.getTime() || 0;
        const timeB = b.reportDate?.getTime() || 0;
        // 報修時間由最舊(小)排到最新(大) -> [最舊] 到 [最新]
        // 若日期無效則放到最後
        if (timeA === 0) return 1;
        if (timeB === 0) return -1;
        return timeA - timeB;
      }),
    [lights]);

  const repairedLights = useMemo(() =>
    lights.filter(l => !l.isUnrepaired),
    [lights]);

  const mapBounds = useMemo(() => {
    if (lights.length === 0) return null;
    const bounds = L.latLngBounds(lights.map(l => [l.lat, l.lng]));
    return bounds;
  }, [lights]);

  const handleSearch = useMemo(() => (id: string) => {
    const light = lights.find(l => l.id === id);
    if (light) {
      setTargetLocation([light.lat, light.lng]);
      setSearchedLightId(id);
    } else {
      alert("查無此路燈編號！");
      setSearchedLightId(null);
    }
  }, [lights]);

  const getReportDiffText = (reportDate?: Date) => {
    if (!reportDate) return "無通報時間";
    const now = new Date();
    const diffMs = now.getTime() - reportDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const daysPart = Math.floor(diffDays);
    const hoursPart = Math.floor((diffMs - daysPart * 24 * 60 * 60 * 1000) / (1000 * 60 * 60));

    let symbol = "🔵";
    if (diffDays >= 7) symbol = "🆘";
    else if (diffDays >= 3) symbol = "⚠️";
    else if (diffDays >= 1) symbol = "🟡";

    return `報修 ${daysPart}天${hoursPart}時 ${symbol}`;
  };

  const getReportTimeText = (reportDate?: Date) => {
    if (!reportDate) return "時間未記錄";
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(reportDate);
  };

  const createClusterCustomIcon = (cluster: any) => {
    const count = cluster.getChildCount();
    let size = "small";
    if (count >= 50) size = "large";
    else if (count >= 20) size = "medium";

    return L.divIcon({
      html: `<div class="cluster-icon ${size}">${count}</div>`,
      className: 'custom-cluster',
      iconSize: L.point(40, 40)
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[100dvh] w-full bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">載入地圖數據中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden font-sans">
      <div className="absolute top-4 left-4 z-[1000] flex items-center overflow-hidden rounded-2xl bg-white/95 shadow-lg backdrop-blur border border-slate-200">
        <div className={`${roleDisplay.color} px-3 py-2.5 text-sm font-black text-white whitespace-nowrap`}>
          {roleDisplay.title}
        </div>
        <button
          onClick={onBackHome}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors whitespace-nowrap"
          aria-label="返回身分選擇首頁"
        >
          <House className="h-4 w-4" />
          <span className="hidden sm:inline">回首頁</span>
        </button>
      </div>

      {/* Search Bar (Shown for all except maintenance - WAIT, user now wants maintenance to have same interface as officer, just no bottom-right) */}
      {role !== null && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-[260px] px-0">
          <SearchBar onSearch={handleSearch} />
        </div>
      )}

      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
      </div>

      {/* Unrepaired List Panel (Visible for all roles) */}
      {role !== null && (
        <div className="absolute bottom-[3px] left-[3px] z-[1000] w-[160px] max-h-[60vh] bg-white/95 backdrop-blur-md shadow-2xl rounded-3xl border border-slate-200 overflow-hidden flex flex-col scale-90 origin-bottom-left">
          <div className="pl-[5px] pr-[5px] py-[5px] border-b border-slate-100 bg-slate-50/50 flex flex-col items-center gap-1">
            <button
              onClick={() => setUnrepairedListOpen(!unrepairedListOpen)}
              className="w-[130px] text-center text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full text-[14px] font-bold transition-colors"
            >
              {unrepairedListOpen ? '隱藏' : '顯示'}
            </button>
            <h3 className="font-bold text-slate-800 flex items-center gap-1.5 text-base whitespace-nowrap">
              未查修清單 ({unrepairedLights.length})
            </h3>
          </div>

          <AnimatePresence>
            {unrepairedListOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden flex flex-col max-h-[60vh]"
              >
                <div className="overflow-y-auto flex-1 pt-[5px] pl-[15px] pr-[5px] pb-[5px] border-t border-slate-100">
                  {unrepairedLights.length === 0 ? (
                    <p className="text-center py-6 text-slate-400 text-sm italic">目前無未查修項目</p>
                  ) : (
                    <ul className="space-y-1">
                      {unrepairedLights.map(light => (
                        <li key={light.id} className="group">
                          <button
                            onClick={() => {
                              setTargetLocation([light.lat, light.lng]);
                              setSearchedLightId(light.id);
                            }}
                            className="w-full py-0.5 px-3 rounded-2xl hover:bg-indigo-50 active:bg-slate-200 transition-colors flex flex-col items-start gap-1"
                          >
                            <div className="flex flex-col items-start w-full">
                              <div className="flex justify-start items-center gap-1.5">
                                <span className="font-bold text-[#0080ffe8] text-[24px]">{light.id}</span>
                                <div className="bg-indigo-100 text-indigo-500 p-1 rounded-xl group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                  <Navigation className="w-4 h-4" />
                                </div>
                              </div>
                              <div className="text-[13px] text-slate-600">
                                {getReportDiffText(light.reportDate)}
                              </div>
                              <div className="text-[11px] text-slate-500 tabular-nums">
                                {getReportTimeText(light.reportDate)}
                              </div>
                              {light.fault && (
                                <div className="text-[12px] text-red-500 font-medium flex gap-1 mt-0.5">
                                  <span className="text-left break-words">{light.fault}</span>
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Bottom Right Actions */}
      {role !== null && (
        <div className="absolute bottom-[3px] right-[3px] z-[1000] flex flex-col items-center justify-center gap-1.5 bg-white/95 backdrop-blur-sm pt-[5px] px-[5px] pb-[3px] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200">
          {role === 'maintenance' && (
            <button
              onClick={() => onNavigateToReport?.()}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-sm w-full leading-none"
            >
              <ClipboardCheck className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap translate-y-[1px]">維修回報系統</span>
            </button>
          )}
          {role === 'admin' && (
            <>
              <button
                onClick={() => onNavigateToReplace?.(lights)}
                className="bg-[#0080ffe8] text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#0066cc] transition-all shadow-sm w-full leading-none"
              >
                <Settings className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap translate-y-[1px]">置換系統</span>
              </button>
              <button
                onClick={() => onNavigateToReport?.()}
                className="bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-sm w-full leading-none"
              >
                <ClipboardCheck className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap translate-y-[1px]">維修回報系統</span>
              </button>
              <button
                onClick={() => onNavigateToDatabase?.()}
                className="bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-all shadow-sm w-full leading-none"
              >
                <Database className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap translate-y-[1px]">資料庫管理</span>
              </button>
            </>
          )}
          {(role === 'officer' || role === 'admin') && (
            <button
              onClick={() => onNavigateToFaultReport?.()}
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-sm w-full leading-none"
            >
              <Lightbulb className="w-4 h-4 shrink-0 fill-yellow-400 text-yellow-300" />
              <span className="whitespace-nowrap translate-y-[1px]">路燈通報系統</span>
            </button>
          )}
          
          {(role === 'survey' || role === 'admin') && (
            <button
              onClick={() => onNavigateToSurvey?.()}
              className="bg-purple-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-purple-700 transition-all shadow-sm w-full leading-none"
            >
              <MapPin className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap translate-y-[1px]">基座調查系統</span>
            </button>
          )}

          <div className="text-[8px] text-slate-400 font-bold tracking-wide opacity-80 text-center w-full">
            02/26/2026 風行王者 <span className="text-[7px]">Design</span>
          </div>
        </div>
      )}

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full z-0"
        maxZoom={22}
        // @ts-ignore
        ref={mapRef}
      >
        <MapController target={targetLocation} bounds={mapBounds} />

        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxNativeZoom={19}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Esri World Imagery">
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxNativeZoom={18}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="OpenTopoMap">
            <TileLayer
              attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
              url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
              maxNativeZoom={17}
              maxZoom={22}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {villageData && (
          <GeoJSON
            data={villageData}
            onEachFeature={(feature, layer) => {
              if (feature.properties && feature.properties.VILLNAME) {
                layer.bindTooltip(feature.properties.VILLNAME, {
                  permanent: true,
                  direction: 'center',
                  className: 'village-label'
                });
              }
            }}
            style={{
              color: '#6366f1',
              weight: 2,
              opacity: 0.7,
              fillOpacity: 0
            }}
          />
        )}

        {/* Unrepaired Markers (Not Clustered, Blinking) */}
        {unrepairedLights.map(light => (
          <Marker
            key={light.id}
            position={[light.lat, light.lng]}
            icon={searchedLightId === light.id ? goldIcon : redIcon}
            zIndexOffset={searchedLightId === light.id ? 2000 : 1000}
          >
            <Popup>
              <div className="p-1 min-w-[150px]">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="px-2 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded-full">⚠️ 未查修</span>
                  <span className="font-bold text-slate-800">編號：{light.id}</span>
                </div>
                <div className="space-y-2 text-xs text-slate-600">
                  <p><span className="font-semibold">故障情形：</span>{light.fault || "未註明"}</p>
                  <p><span className="font-semibold">通報時間：</span>{getReportTimeText(light.reportDate)}</p>
                  <p><span className="font-semibold">通報狀態：</span>{getReportDiffText(light.reportDate)}</p>
                  <a
                    href={`https://www.google.com/maps?q=&layer=c&cbll=${light.lat},${light.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-bold transition-colors mt-3"
                  >
                    <ExternalLink className="w-3 h-3" />
                    查看街景
                  </a>
                </div>
              </div>
            </Popup>
            {showTooltips && (
              <Tooltip permanent direction="top" offset={[0, -32]} opacity={0.9}>
                {light.id}
              </Tooltip>
            )}
          </Marker>
        ))}

        {/* Repaired Markers (Clustered) */}
        <MarkerClusterGroup
          chunkedLoading
          iconCreateFunction={createClusterCustomIcon}
          maxClusterRadius={50}
        >
          {/* Repaired Markers (Shown for all) */}
          {repairedLights.map(light => (
            <Marker
              key={light.id}
              position={[light.lat, light.lng]}
              icon={searchedLightId === light.id ? goldIcon : blueIcon}
              zIndexOffset={searchedLightId === light.id ? 2000 : 0}
            >
              <Popup>
                <div className="p-1 min-w-[150px]">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <span className="font-bold text-slate-800">編號：{light.id}</span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600">
                    <a
                      href={`https://www.google.com/maps?q=&layer=c&cbll=${light.lat},${light.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg font-bold transition-colors mt-3"
                    >
                      <ExternalLink className="w-3 h-3" />
                      查看街景
                    </a>
                  </div>
                </div>
              </Popup>
              {showTooltips && (
                <Tooltip permanent direction="top" offset={[0, -32]} opacity={0.9}>
                  {light.id}
                </Tooltip>
              )}
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
    </div >
  );
}
