import React, { useState, useEffect, useRef } from 'react';
import './RepairReportView.css';
import { ChevronLeft } from 'lucide-react';
// @ts-ignore
import * as EXIF from 'exif-js';
import { getStreetlights, saveBaseSurvey } from '../services/database';
import { StreetLightLocation } from '../types';

// GAS WEB APP URL 供使用者日後自行替換

interface BaseSurveyViewProps {
    onBack: () => void;
}

export default function BaseSurveyView({ onBack }: BaseSurveyViewProps) {
    const [rDate, setRDate] = useState("");
    const [gpsLightId, setGpsLightId] = useState<string>("");
    const [gpsLat, setGpsLat] = useState<number | null>(null);
    const [gpsLng, setGpsLng] = useState<number | null>(null);

    const [lightsDict, setLightsDict] = useState<StreetLightLocation[]>([]);

    const [prePhoto, setPrePhoto] = useState<string | null>(null);
    const [postPhoto, setPostPhoto] = useState<string | null>(null);

    const [prePhotoFile, setPrePhotoFile] = useState<File | null>(null);
    const [postPhotoFile, setPostPhotoFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isLocating, setIsLocating] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadText, setUploadText] = useState("0.0%");
    const [uploadTitle, setUploadTitle] = useState("📤 正在處理資料");

    const smoothIntervalRef = useRef<any>(null);
    const lastKnownLoc = useRef<{ lat: number; lng: number } | null>(null);
    const gpsRequestIdRef = useRef(0);

    const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: "", show: false });
    const showToast = (msg: string) => {
        setToast({ msg, show: true });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    useEffect(() => {
        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
        setRDate(localISOTime);
        getStreetlights()
            .then(d => setLightsDict(d))
            .catch(err => console.error("Error fetching light references:", err));
    }, []);

    const handlePick = (inputId: string) => {
        if (inputId.includes('pre')) {
            preFetchLocation();
        }
        const el = document.getElementById(inputId);
        if (el) {
            el.removeAttribute("capture"); // 移除強制拍照屬性，讓它回歸選相簿功能
            el.click();
        }
    };

    const handleCam = (inputId: string) => {
        if (inputId.includes('pre')) {
            preFetchLocation();
        }
        const el = document.getElementById(inputId);
        if (el) {
            el.setAttribute("capture", "environment");
            el.click();
        }
    };

    const preFetchLocation = () => {
        if (!("geolocation" in navigator)) return;

        // 開始背景定位，但不鎖定 UI
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                lastKnownLoc.current = { lat: latitude, lng: longitude };
                console.log("[GPS] Background pre-fetch success:", latitude, longitude);

                // 如果目前輸入框是空的，可以考慮直接幫它算一下最近路燈 (悄悄進行)
                if (!gpsLightId && lightsDict.length > 0) {
                    findClosestLightQuietly(latitude, longitude);
                }
            },
            (err) => console.warn("[GPS] Background pre-fetch failed:", err),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const findClosestLightQuietly = (lat: number, lng: number) => {
        setGpsLat(lat);
        setGpsLng(lng);
        let minLightId = "";
        let minD = Infinity;
        for (let l of lightsDict) {
            let lLat = parseFloat(l["緯度Latitude"]);
            let lLng = parseFloat(l["經度Longitude"]);
            if (!isNaN(lLat) && !isNaN(lLng)) {
                let d = getDistance(lat, lng, lLat, lLng);
                if (d < minD) {
                    minD = d;
                    minLightId = l["原路燈號碼"]?.trim() || "";
                }
            }
        }
        if (minLightId) setGpsLightId(minLightId);
    };

    const convertDMSToDD = (dmsArray: any, ref: string) => {
        if (!dmsArray || dmsArray.length !== 3) return null;
        const getVal = (x: any) => typeof x.numerator !== 'undefined' ? x.numerator / x.denominator : Number(x);
        let d = getVal(dmsArray[0]);
        let m = getVal(dmsArray[1]);
        let s = getVal(dmsArray[2]);
        let dd = d + m / 60 + s / 3600;
        if (ref === "S" || ref === "W") dd *= -1;
        return dd;
    };

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371e3;
        const rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad;
        const dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const findClosestLight = (lat: number, lng: number) => {
        try {
            setGpsLat(lat);
            setGpsLng(lng);
            if (!lightsDict || lightsDict.length === 0) {
                console.warn("lightsDict empty, cannot match GPS");
                return;
            }
            let minLightId = "";
            let minD = Infinity;
            for (let l of lightsDict) {
                let lLat = parseFloat(l["緯度Latitude"]);
                let lLng = parseFloat(l["經度Longitude"]);
                if (!isNaN(lLat) && !isNaN(lLng)) {
                    let d = getDistance(lat, lng, lLat, lLng);
                    if (d < minD) {
                        minD = d;
                        minLightId = l["原路燈號碼"]?.trim() || "";
                    }
                }
            }
            if (minLightId) {
                setGpsLightId(minLightId);
            }
        } catch (err) {
            console.error("Error in findClosestLight:", err);
        } finally {
            setIsLocating(false);
        }
    };

    const handleManualGPS = () => {
        if ("geolocation" in navigator) {
            setIsLocating(true);
            const reqId = ++gpsRequestIdRef.current;
            navigator.geolocation.getCurrentPosition((pos) => {
                if (reqId !== gpsRequestIdRef.current) {
                    console.log("[GPS] Discarding outdated request:", reqId);
                    return;
                }
                findClosestLight(pos.coords.latitude, pos.coords.longitude);
                setTimeout(() => alert("已成功更新GPS並尋找最近路燈！"), 100);
            }, (err) => {
                if (reqId !== gpsRequestIdRef.current) return;
                setIsLocating(false);
                setTimeout(() => alert("無法取得位置，請確認是否允許網頁存取 GPS。"), 100);
            }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
        } else {
            alert("您的瀏覽器不支援定位功能。");
        }
    };

    // --- 手寫二進制 EXIF 解析引擎 (最強相容性) ---
    const extractEXIFManual = (buffer: ArrayBuffer) => {
        const dv = new DataView(buffer);
        if (dv.getUint16(0) !== 0xFFD8) return null;

        let offset = 2;
        while (offset < dv.byteLength) {
            const marker = dv.getUint16(offset);
            if (marker === 0xFFE1) return parseExifFull(dv, offset + 4);
            if ((marker & 0xFF00) !== 0xFF) break;
            offset += 2 + dv.getUint16(offset + 2);
        }
        return null;
    };

    const parseExifFull = (dv: DataView, offset: number) => {
        if (dv.getUint32(offset) !== 0x45786966) return null;
        const little = dv.getUint16(offset + 6) === 0x4949;
        const ifd0Off = dv.getUint32(offset + 10, little);
        const entries = dv.getUint16(offset + 6 + ifd0Off, little);

        let res: { date?: string; lat?: number; lng?: number } = {};
        let exifOff = -1;
        let gpsOff = -1;

        for (let i = 0; i < entries; i++) {
            const off = offset + 6 + ifd0Off + 2 + i * 12;
            const tag = dv.getUint16(off, little);
            if (tag === 0x8769) exifOff = dv.getUint32(off + 8, little);
            if (tag === 0x8825) gpsOff = dv.getUint32(off + 8, little);
        }

        if (exifOff !== -1) {
            const exifEntries = dv.getUint16(offset + 6 + exifOff, little);
            for (let i = 0; i < exifEntries; i++) {
                const off = offset + 6 + exifOff + 2 + i * 12;
                const tag = dv.getUint16(off, little);
                if (tag === 0x9003 || tag === 0x0132) {
                    const valOff = dv.getUint32(off + 8, little) + offset + 6;
                    let s = "";
                    for (let j = 0; j < 19; j++) s += String.fromCharCode(dv.getUint8(valOff + j));
                    const p = s.split(" ");
                    if (p.length === 2) {
                        res.date = p[0].replace(/:/g, "-") + "T" + p[1].substring(0, 5);
                    }
                }
            }
        }

        if (gpsOff !== -1) {
            const gpsEntries = dv.getUint16(offset + 6 + gpsOff, little);
            let lat, lng, latRef = 'N', lngRef = 'E';
            const getRat = (off: number) => {
                const n = dv.getUint32(off, little), d = dv.getUint32(off + 4, little);
                return d === 0 ? 0 : n / d;
            };
            for (let i = 0; i < gpsEntries; i++) {
                const off = offset + 6 + gpsOff + 2 + i * 12;
                const tag = dv.getUint16(off, little);
                const sub = dv.getUint32(off + 8, little) + offset + 6;
                if (tag === 1) latRef = String.fromCharCode(dv.getUint8(off + 8)) === 'S' ? 'S' : 'N';
                if (tag === 2) lat = getRat(sub) + getRat(sub + 8) / 60 + getRat(sub + 16) / 3600;
                if (tag === 3) lngRef = String.fromCharCode(dv.getUint8(off + 8)) === 'W' ? 'W' : 'E';
                if (tag === 4) lng = getRat(sub) + getRat(sub + 8) / 60 + getRat(sub + 16) / 3600;
            }
            if (lat !== undefined && lng !== undefined) {
                res.lat = latRef === 'S' ? -lat : lat;
                res.lng = lngRef === 'W' ? -lng : lng;
            }
        }
        return res;
    };

    const extractEXIFFromLibrary = (file: File): Promise<{ date?: string, lat?: number, lng?: number } | null> => {
        return new Promise((resolve) => {
            try {
                // @ts-ignore
                EXIF.getData(file, function (this: any) {
                    // @ts-ignore
                    const lat = EXIF.getTag(this, "GPSLatitude");
                    // @ts-ignore
                    const lng = EXIF.getTag(this, "GPSLongitude");
                    // @ts-ignore
                    const latRef = EXIF.getTag(this, "GPSLatitudeRef") || "N";
                    // @ts-ignore
                    const lngRef = EXIF.getTag(this, "GPSLongitudeRef") || "E";
                    // @ts-ignore
                    const dateRaw = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");

                    let date: string | undefined = undefined;
                    if (dateRaw && typeof dateRaw === 'string') {
                        const p = dateRaw.trim().split(" ");
                        if (p.length === 2) {
                            date = p[0].replace(/:/g, "-") + "T" + p[1].substring(0, 5);
                        }
                    }

                    let finalLat: number | undefined = undefined;
                    let finalLng: number | undefined = undefined;

                    if (lat && lng) {
                        const getVal = (x: any) => {
                            if (x === null || x === undefined) return 0;
                            if (typeof x === 'object' && typeof x.numerator !== 'undefined') {
                                return x.denominator === 0 ? 0 : x.numerator / x.denominator;
                            }
                            return Number(x);
                        };
                        const dLat = getVal(lat[0]) + getVal(lat[1]) / 60 + getVal(lat[2]) / 3600;
                        const dLng = getVal(lng[0]) + getVal(lng[1]) / 60 + getVal(lng[2]) / 3600;

                        finalLat = latRef === "S" ? -dLat : dLat;
                        finalLng = lngRef === "W" ? -dLng : dLng;
                    }

                    if (date || (finalLat && finalLng)) {
                        resolve({ date, lat: finalLat, lng: finalLng });
                    } else {
                        resolve(null);
                    }
                });
            } catch (err) {
                console.error("EXIF library parsing error:", err);
                resolve(null);
            }
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'pre' | 'post') => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 手機拍照時，系統相機已自動將照片存入相簿。
        // 在 LINE 或部分 WebView 內使用 link.click() 下載 Blob 會被安全性原則阻擋導致網頁卡死或重新整理，故移除該下載邏輯以避免崩潰。

        // 🚀 1. 立即、非阻塞地載入照片預覽，確保 UI 體驗流暢！
        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            if (type === 'pre') setPrePhoto(dataUrl);
            if (type === 'post') setPostPhoto(dataUrl);
            if (type === 'pre') setPrePhotoFile(file);
            if (type === 'post') setPostPhotoFile(file);
        };
        reader.readAsDataURL(file);

        // 🚀 2. 非同步、安全地在背景解析 GPS EXIF 資訊，絕不卡死照片載入！
        if (type === 'pre') {
            setIsLocating(true);
            const reqId = ++gpsRequestIdRef.current;
            try {
                // 優先使用 exif-js 標準庫解析
                let data = await extractEXIFFromLibrary(file);

                // 若標準庫沒解析出來，則 fallback 到手寫二進位解析引擎
                if (!data) {
                    console.warn("[GPS] exif-js found no data, falling back to manual binary parser...");
                    const buffer = await file.arrayBuffer();
                    data = extractEXIFManual(buffer);
                }

                if (data) {
                    // 更新時間 (datetime-local 格式需為 YYYY-MM-DDTHH:mm)
                    if (data.date) {
                        setRDate(data.date);
                        showToast(`📅 自動校對拍照時間: ${data.date.replace("T", " ")}`);
                    }
                    // 更新座標與搜尋最近路燈
                    if (data.lat && data.lng) {
                        if (reqId === gpsRequestIdRef.current) {
                            setGpsLat(data.lat);
                            setGpsLng(data.lng);
                            showToast("📍 成功讀取照片 GPS 座標");
                            findClosestLight(data.lat, data.lng);
                        }
                    } else {
                        showToast("⚠️ 相片中沒有 GPS 座標資訊");
                        if (reqId === gpsRequestIdRef.current) {
                            setIsLocating(false);
                        }
                    }
                } else {
                    showToast("⚠️ 相片中沒有 GPS 座標資訊");
                    if (reqId === gpsRequestIdRef.current) {
                        setIsLocating(false);
                    }
                }
            } catch (err) {
                console.error("EXIF Parsing Error:", err);
                if (reqId === gpsRequestIdRef.current) {
                    setIsLocating(false);
                }
            }
        }
    };

    const startSmoothClimb = (startP: number, maxP: number, speed: number) => {
        let current = startP;
        clearInterval(smoothIntervalRef.current);
        smoothIntervalRef.current = setInterval(() => {
            if (current < maxP) {
                let step = (maxP - current) * 0.05;
                current += step < 0.01 ? 0.01 : step;
                setUploadProgress(current);
                setUploadText(current.toFixed(1) + "%");
            } else {
                clearInterval(smoothIntervalRef.current);
            }
        }, speed);
    };

    const compress = (b: string): Promise<string> => {
        return new Promise(res => {
            let i = new Image();
            i.src = b;
            i.onload = () => {
                let c = document.createElement("canvas"), w = i.width, h = i.height, m = 1024;
                if (w > h && w > m) { h *= m / w; w = m; }
                else if (h > m) { w *= m / h; h = m; }
                c.width = w; c.height = h;
                c.getContext("2d")?.drawImage(i, 0, 0, w, h);
                res(c.toDataURL("image/jpeg", 0.7));
            };
        });
    };

    const handleUpload = async () => {
        if (!prePhoto && !postPhoto) return alert("請至少上傳一張照片");
        if (!gpsLightId) return alert("請先給定或確認抓取到的路燈編號");

        setIsUploading(true);
        setUploadTitle("📤 正在處理資料");
        setUploadProgress(0);
        setUploadText("0.0%");

        // 原圖上傳，保留 EXIF 資訊
        let a = prePhoto || "";
        setUploadProgress(25); setUploadText("25%");

        let b = postPhoto || "";
        setUploadProgress(50); setUploadText("50%");

        setUploadTitle("🚀 資料傳送中...");
        startSmoothClimb(50.1, 98.5, 150);

        try {
            await saveBaseSurvey({
                dateStr: rDate,
                lightId: gpsLightId,
                lat: gpsLat,
                lng: gpsLng,
                photo1: prePhotoFile,
                photo2: postPhotoFile
            });

            clearInterval(smoothIntervalRef.current);
            setUploadProgress(100.0);
            setUploadText("100.0%");
            setUploadTitle("✅ 儲存成功");
            setTimeout(() => {
                alert("上傳成功！資料已寫入推算表。");
                setPrePhoto(null);
                setPostPhoto(null);
                setGpsLightId("");
                setGpsLat(null);
                setGpsLng(null);

                // 重新校正時間為當前最新時間
                const now = new Date();
                const offset = now.getTimezoneOffset() * 60000;
                const localISOTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);
                setRDate(localISOTime);

                // 清空 HTML 檔案輸入框快取
                const fPre = document.getElementById('f-pre') as HTMLInputElement;
                if (fPre) fPre.value = '';
                const fPost = document.getElementById('f-post') as HTMLInputElement;
                if (fPost) fPost.value = '';

                setIsUploading(false);
            }, 800);
        } catch (err) {
            clearInterval(smoothIntervalRef.current);
            alert("上傳失敗，請檢查網路後重試。");
            setIsUploading(false);
        }
    };

    const isComplete = prePhoto || postPhoto;

    return (
        <div className="repair-report-container">
            <button onClick={onBack} className="report-back-btn">
                <ChevronLeft className="w-5 h-5" /> 返回
            </button>
            <div className="nav-bar-report"><div className="nav-title-report">路燈基座調查</div></div>

            <div className={`report-content ${isUploading ? 'report-lock' : ''}`} id="page">
                <div className="report-card">
                    <label className="report-label">GPS抓取路燈號碼</label>
                    {gpsLat && gpsLng && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>
                            📍 經緯度: {gpsLat.toFixed(6)}, {gpsLng.toFixed(6)}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                            type="text"
                            className="report-input-field"
                            placeholder={isLocating ? "⏳ 正在抓取位置..." : "將從照片中自動抓取最相近路燈"}
                            value={gpsLightId}
                            onChange={(e) => setGpsLightId(e.target.value)}
                            style={{ margin: 0, border: isLocating ? '2px solid #a855f7' : undefined }}
                        />
                        <button
                            className="bg-purple-100 text-purple-600 px-3 rounded-lg font-bold text-sm whitespace-nowrap flex-shrink-0 active:bg-purple-200"
                            onClick={handleManualGPS}
                            style={{ margin: 0 }}
                            title="若照片無 GPS 或抓取不到，可點擊此按鈕抓取現在位置"
                        >
                            📍重新定位
                        </button>
                    </div>
                    <label className="report-label" style={{ marginTop: '1rem' }}>調查時間</label>
                    <input
                        type="datetime-local"
                        className="report-input-field"
                        value={rDate}
                        onChange={(e) => setRDate(e.target.value)}
                    />
                </div>

                <div id="photoContainer">
                    <div className="report-photo-card">
                        <div className="report-photo-header">
                            <div>📸 基座照片上傳</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className={`report-status-badge ${isComplete ? 'status-complete' : 'status-incomplete'}`}>
                                    {isComplete ? '已拍照' : '未拍照'}
                                </span>
                            </div>
                        </div>
                        <div className="report-photo-body">
                            <div className="comparison-grid">
                                <div>
                                    <div className="comp-label">照片1 (路燈編號)</div>
                                    <div className="report-upload-box" onClick={() => !prePhoto && handlePick(`f-pre`)}>
                                        {!prePhoto ? (
                                            <div className="report-upload-icon">照片上傳📷</div>
                                        ) : (
                                            <>
                                                <button className="report-remove-btn" onClick={(e) => { e.stopPropagation(); setPrePhoto(null); }}>✕</button>
                                                <img src={prePhoto} alt="pre" />
                                            </>
                                        )}
                                    </div>
                                    {!prePhoto && (
                                        <button className="report-cam-btn" onClick={() => handleCam(`f-pre`)}>📸 拍照上傳</button>
                                    )}
                                    <input
                                        type="file"
                                        className="hidden"
                                        id={`f-pre`}
                                        accept="image/*"
                                        onChange={(e) => handleFileChange(e, 'pre')}
                                    />
                                </div>
                                <div>
                                    <div className="comp-label">照片2 (路燈基座)</div>
                                    <div className="report-upload-box" onClick={() => !postPhoto && handlePick(`f-post`)}>
                                        {!postPhoto ? (
                                            <div className="report-upload-icon">照片上傳📷</div>
                                        ) : (
                                            <>
                                                <button className="report-remove-btn" onClick={(e) => { e.stopPropagation(); setPostPhoto(null); }}>✕</button>
                                                <img src={postPhoto} alt="post" />
                                            </>
                                        )}
                                    </div>
                                    {!postPhoto && (
                                        <button className="report-cam-btn" onClick={() => handleCam(`f-post`)}>📸 拍照上傳</button>
                                    )}
                                    <input
                                        type="file"
                                        className="hidden"
                                        id={`f-post`}
                                        accept="image/*"
                                        onChange={(e) => handleFileChange(e, 'post')}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button className="report-btn-submit" onClick={handleUpload}>確認上傳存檔</button>
            </div>

            <div className={`report-upload-mask ${!isUploading ? 'hidden' : ''}`}>
                <div className="report-upload-box-ui">
                    <div className="report-upload-title">{uploadTitle}</div>
                    <div className="report-progress-bar">
                        <div className="report-progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                    </div>
                    <div className="report-progress-text">{uploadText}</div>
                </div>
            </div>
        </div>
    );
}
