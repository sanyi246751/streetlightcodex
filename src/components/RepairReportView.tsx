import React, { useState, useEffect, useRef } from 'react';
import './RepairReportView.css';
import { ChevronLeft, AlertCircle, Loader2 } from 'lucide-react';
// @ts-ignore
import * as EXIF from 'exif-js';

import { completeRepair, getPendingRepairs } from '../services/database';

interface Group {
    id: number;
    pre: string | null;
    post: string | null;
    preFile?: File;
    postFile?: File;
}

interface ProjectItem {
    row: string;
    text: string;
    colA?: string;
    colB?: string;
}

interface RepairReportViewProps {
    onBack: () => void;
}

export default function RepairReportView({ onBack }: RepairReportViewProps) {
    const [projectData, setProjectData] = useState<ProjectItem[]>([]);
    const [selectedItem, setSelectedItem] = useState("");
    const [rDate, setRDate] = useState("");
    const [groups, setGroups] = useState<Group[]>([{ id: 1, pre: null, post: null }]);
    const [groupIdCounter, setGroupIdCounter] = useState(1);
    const [noteSelect, setNoteSelect] = useState("");
    const [noteText, setNoteText] = useState("");

    const [isUploading, setIsUploading] = useState(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadText, setUploadText] = useState("0.0%");
    const [uploadTitle, setUploadTitle] = useState("📤 正在處理資料");

    const [toast, setToast] = useState<{ msg: string; show: boolean }>({ msg: "", show: false });
    const showToast = (msg: string) => {
        setToast({ msg, show: true });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    const smoothIntervalRef = useRef<any>(null);

    useEffect(() => {
        setRDate(new Date().toISOString().split("T")[0]);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒逾時

        setIsLoading(true);
        setLoadingError(null);

        getPendingRepairs()
            .then(d => {
                if (Array.isArray(d)) {
                    setProjectData(d);
                } else {
                    console.error("Data received is not an array:", d);
                    throw new Error("接收到的資料格式不正確");
                }
            })
            .catch(err => {
                console.error("Error fetching project data:", err);
                if (err.name === 'AbortError') {
                    setLoadingError("連線逾時，請檢查網路或是 Google 腳本是否正常。");
                } else {
                    setLoadingError("讀取待修清單失敗：" + (err.message || "未知原因"));
                }
            })
            .finally(() => {
                clearTimeout(timeoutId);
                setIsLoading(false);
            });

        return () => controller.abort();
    }, []);

    const addGroup = () => {
        const nextId = groupIdCounter + 1;
        setGroupIdCounter(nextId);
        setGroups(prev => [...prev, { id: nextId, pre: null, post: null }]);
    };

    const removeGroup = (id: number) => {
        if (groups.length <= 1) return alert("至少要保留一組");
        if (window.confirm("確定刪除？")) {
            setGroups(prev => prev.filter(g => g.id !== id));
        }
    };

    // --- 手寫二進制 EXIF 解析引擎 (最穩定，不依賴套件) ---
    const extractEXIFManual = (buffer: ArrayBuffer) => {
        const dv = new DataView(buffer);
        if (dv.getUint16(0) !== 0xFFD8) return null; 

        let offset = 2;
        while (offset < dv.byteLength) {
            const marker = dv.getUint16(offset);
            if (marker === 0xFFE1) return parseExifSimple(dv, offset + 4);
            if ((marker & 0xFF00) !== 0xFF) break;
            offset += 2 + dv.getUint16(offset + 2);
        }
        return null;
    };

    const parseExifSimple = (dv: DataView, offset: number) => {
        if (dv.getUint32(offset) !== 0x45786966) return null;
        const little = dv.getUint16(offset + 6) === 0x4949;
        const ifd0Off = dv.getUint32(offset + 10, little);
        const entries = dv.getUint16(offset + 6 + ifd0Off, little);
        let exifOff = -1;
        for (let i = 0; i < entries; i++) {
            const off = offset + 6 + ifd0Off + 2 + i * 12;
            if (dv.getUint16(off, little) === 0x8769) exifOff = dv.getUint32(off + 8, little);
        }
        if (exifOff === -1) return null;
        const exifEntries = dv.getUint16(offset + 6 + exifOff, little);
        for (let i = 0; i < exifEntries; i++) {
            const off = offset + 6 + exifOff + 2 + i * 12;
            const tag = dv.getUint16(off, little);
            if (tag === 0x9003 || tag === 0x0132) {
                const valOff = dv.getUint32(off + 8, little) + offset + 6;
                let s = "";
                for (let j = 0; j < 10; j++) s += String.fromCharCode(dv.getUint8(valOff + j));
                return { date: s.replace(/:/g, "-") };
            }
        }
        return null;
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, groupId: number, type: 'pre' | 'post') => {
        const file = e.target.files?.[0];
        if (!file) return;

        // 手機拍照時，系統相機已自動將照片存入相簿。
        // 在 LINE 或部分 WebView 內使用 link.click() 下載 Blob 會被安全性原則阻擋導致網頁卡死或重新整理，故移除該下載邏輯以避免崩潰。

        if (type === 'pre') {
            try {
                const buffer = await file.arrayBuffer();
                const data = extractEXIFManual(buffer);
                if (data && data.date) {
                    setRDate(data.date);
                    showToast(`📅 已自動填入拍照日期: ${data.date}`);
                } else {
                    showToast("⚠️ 照片中找不到日期資訊");
                }
            } catch (err) {
                console.error("EXIF manual read error", err);
            }
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setGroups(prev => prev.map(g => {
                if (g.id === groupId) return { ...g, [type]: dataUrl, [type === 'pre' ? 'preFile' : 'postFile']: file };
                return g;
            }));
        };
        reader.readAsDataURL(file);
    };

    const removePhoto = (groupId: number, type: 'pre' | 'post') => {
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return { ...g, [type]: null };
            }
            return g;
        }));
    };

    const handlePick = (inputId: string) => {
        const el = document.getElementById(inputId);
        if (el) {
            el.removeAttribute("capture");
            el.click();
        }
    };

    const handleCam = (inputId: string) => {
        const el = document.getElementById(inputId);
        if (el) {
            el.setAttribute("capture", "environment");
            el.click();
        }
    };

    const completeCount = groups.filter(g => g.pre && g.post).length;

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
        if (!selectedItem) return alert("請選擇維修項目");

        const firstIncomplete = groups.find(g => !g.pre || !g.post);
        if (firstIncomplete) {
            const el = document.getElementById(`g${firstIncomplete.id}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("report-shake");
                setTimeout(() => el.classList.remove("report-shake"), 500);
            }
            return alert("有照片未完成");
        }

        setIsUploading(true);
        setUploadTitle("📤 正在處理資料");
        setUploadProgress(0);
        setUploadText("0.0%");

        let photos = [];
        let totalImgs = groups.length * 2;
        let currentStep = 0;

        for (let i = 0; i < groups.length; i++) {
            let g = groups[i];
            let a = g.pre!;
            currentStep++;
            let p1 = (currentStep / totalImgs) * 50;
            setUploadProgress(p1);
            setUploadText(p1.toFixed(1) + "%");

            let b = g.post!;
            currentStep++;
            let p2 = (currentStep / totalImgs) * 50;
            setUploadProgress(p2);
            setUploadText(p2.toFixed(1) + "%");

            photos.push({ pre: g.preFile!, post: g.postFile! });
        }

        setUploadTitle("🚀 資料傳送中...");
        startSmoothClimb(50.1, 98.5, 150);

        // 核心修正：將比較對象統一轉為字串，避免 row (數字) !== selectedItem (字串) 的問題
        let cur = projectData.find(d => String(d.row) === String(selectedItem));

        try {
            const finalNote = noteSelect === "其他" ? noteText : noteSelect;
            await completeRepair(selectedItem, finalNote, rDate, photos);

            // 在 no-cors 模式下我們無法讀取回應內容，但如果沒有拋出異常通常代表發送成功
            clearInterval(smoothIntervalRef.current);
            setUploadProgress(100.0);
            setUploadText("100.0%");
            setUploadTitle("✅ 儲存成功");
            
            setTimeout(() => {
                alert("上傳成功！資料已寫入試算表。");
                // --- 改為手動重置，不重新整理網頁 ---
                setGroups([{ id: 1, pre: null, post: null }]);
                setSelectedItem("");
                setNoteSelect("");
                setNoteText("");
                setIsUploading(false);
                setUploadProgress(0);
                
                // 重新讀取最新的待修清單 (剛剛維修的那筆會消失)
                setIsLoading(true);
                getPendingRepairs()
                    .then(d => {
                        if (Array.isArray(d)) setProjectData(d);
                    })
                    .finally(() => setIsLoading(false));
            }, 800);
        } catch (err) {
            clearInterval(smoothIntervalRef.current);
            alert("上傳失敗，請檢查網路後重試。");
            setIsUploading(false);
        }
    };

    return (
        <div className="repair-report-container">
            <button onClick={onBack} className="report-back-btn">
                <ChevronLeft className="w-5 h-5" /> 返回
            </button>
            <div className="nav-bar-report"><div className="nav-title-report">路燈維修回報系統</div></div>

            <div className={`report-content ${isUploading ? 'report-lock' : ''}`} id="page">
                {isLoading ? (
                    <div className="report-card text-center py-10">
                        <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-500 mb-4" />
                        <div className="text-slate-500 font-bold">正在讀取待修清單...</div>
                    </div>
                ) : loadingError ? (
                    <div className="report-card text-center py-10">
                        <AlertCircle className="w-12 h-12 mx-auto text-red-400 mb-4" />
                        <div className="text-red-500 font-bold mb-2">{loadingError}</div>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-slate-100 px-4 py-2 rounded-lg text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                        >
                            重新整理
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="report-card">
                            <label className="report-label">維修項目</label>
                            <select
                                className="report-input-field"
                                value={selectedItem}
                                onChange={(e) => setSelectedItem(e.target.value)}
                            >
                                <option value="">-- 請選擇維修項目 --</option>
                                {projectData.map((x, i) => (
                                    <option key={i} value={x.row}>{x.text}</option>
                                ))}
                            </select>
                            <label className="report-label">維修日期</label>
                            <input
                                type="date"
                                className="report-input-field"
                                value={rDate}
                                onChange={(e) => setRDate(e.target.value)}
                            />
                        </div>

                        <div id="photoContainer">
                            {groups.map((group, index) => {
                                const isComplete = group.pre && group.post;
                                return (
                                    <div
                                        key={group.id}
                                        id={`g${group.id}`}
                                        className={`report-photo-card ${isComplete ? '' : 'incomplete'}`}
                                    >
                                        <div className="report-photo-header">
                                            <div>📸 第 {index + 1} 組維修照片</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className={`report-status-badge ${isComplete ? 'status-complete' : 'status-incomplete'}`}>
                                                    {isComplete ? '已完成' : '未完成'}
                                                </span>
                                                <button className="report-delete-btn" onClick={() => removeGroup(group.id)} type="button">
                                                    <svg viewBox="0 0 24 24">
                                                        <path d="M3 6h18v2H3V6zm2 3h14l-1.5 12h-11L5 9zm5-5h4v2h-4V4z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="report-photo-body">
                                            <div className="comparison-grid">
                                                {/* 維修前 */}
                                                <div>
                                                    <div className="comp-label">維修前照片</div>
                                                    <div className="report-upload-box" onClick={() => !group.pre && handlePick(`f-pre-${group.id}`)}>
                                                        {!group.pre ? (
                                                            <div className="report-upload-icon">照片上傳📷</div>
                                                        ) : (
                                                            <>
                                                                <button className="report-remove-btn" onClick={(e) => { e.stopPropagation(); removePhoto(group.id, 'pre'); }}>✕</button>
                                                                <img src={group.pre} alt="pre" />
                                                            </>
                                                        )}
                                                    </div>
                                                    {!group.pre && (
                                                        <button className="report-cam-btn" onClick={() => handleCam(`f-pre-${group.id}`)}>📸 拍照上傳</button>
                                                    )}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        id={`f-pre-${group.id}`}
                                                        accept="image/*"
                                                        onChange={(e) => handleFileChange(e, group.id, 'pre')}
                                                    />
                                                </div>
                                                {/* 維修後 */}
                                                <div>
                                                    <div className="comp-label">維修後照片</div>
                                                    <div className="report-upload-box" onClick={() => !group.post && handlePick(`f-post-${group.id}`)}>
                                                        {!group.post ? (
                                                            <div className="report-upload-icon">照片上傳📷</div>
                                                        ) : (
                                                            <>
                                                                <button className="report-remove-btn" onClick={(e) => { e.stopPropagation(); removePhoto(group.id, 'post'); }}>✕</button>
                                                                <img src={group.post} alt="post" />
                                                            </>
                                                        )}
                                                    </div>
                                                    {!group.post && (
                                                        <button className="report-cam-btn" onClick={() => handleCam(`f-post-${group.id}`)}>📸 拍照上傳</button>
                                                    )}
                                                    <input
                                                        type="file"
                                                        className="hidden"
                                                        id={`f-post-${group.id}`}
                                                        accept="image/*"
                                                        onChange={(e) => handleFileChange(e, group.id, 'post')}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <button className="report-btn-add" onClick={addGroup}>＋ 新增一組維修照片</button>
                        <div className="report-complete-count" id="countText">
                            {completeCount > 0 ? `✅ 已完成 ${completeCount} 組維修照片` : '尚未完成任何組別'}
                        </div>

                        <div className="report-card">
                            <label className="report-label">維修說明 (備註)</label>
                            <select
                                className="report-input-field"
                                value={noteSelect}
                                onChange={(e) => setNoteSelect(e.target.value)}
                            >
                                <option value="">無</option>
                                <option value="外線故障，已通知台電處理">外線故障，已通知台電處理</option>
                                <option value="自備線故障">自備線故障</option>
                                <option value="其他">其他</option>
                            </select>
                            <textarea
                                className={`report-input-field ${noteSelect !== "其他" ? "hidden" : ""}`}
                                style={{ height: '80px' }}
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="請輸入其他備註"
                            ></textarea>
                        </div>

                        <button className="report-btn-submit" onClick={handleUpload}>確認上傳存檔</button>
                    </>
                )}
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
