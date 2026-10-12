# 🏮 三義鄉路燈管理系統 (streetlightcodex) 專案架構與檔案清單指南

本專案為專為**苗栗縣三義鄉公所**設計之綜合性路燈地理資訊（GIS）、巡檢報修、維修回報、基座調查、座標置換與歷程管理系統。整合了前端 SPA（React 19 + TypeScript + Vite + Tailwind CSS 4 + Leaflet）、雲端後端（Supabase PostgreSQL + Storage + Deno Edge Functions）、外部自動化（LINE Messaging API + Google Apps Script + Google Drive/Sheets 備份），以及內網專屬的 SQL Server 歷史照片檢視服務。

---

## 📑 目錄

1. [系統整體架構與核心技術棧](#1-系統整體架構與核心技術棧)
2. [系統角色與路由模組對照](#2-系統角色與路由模組對照)
3. [各資料夾功能詳細說明](#3-各資料夾功能詳細說明)
4. [專案各檔案詳細作用清單](#4-專案各檔案詳細作用清單)
   - [根目錄設定與核心檔案](#41-根目錄設定與核心檔案)
   - [.github/ (CI/CD 自動化部署)](#42-github-cicd-自動化部署)
   - [.vscode/ (編輯器設定)](#43-vscode-編輯器設定)
   - [admin/ & admin/database/ (管理員後台入口)](#44-admin--admindatabase-管理員後台入口)
   - [base-survey/ (基座調查入口)](#45-base-survey-基座調查入口)
   - [fault-report/ (故障通報入口)](#46-fault-report-故障通報入口)
   - [repair-report/ (維修回報入口)](#47-repair-report-維修回報入口)
   - [replacement/ (座標置換入口)](#48-replacement-座標置換入口)
   - [public/ (靜態資源與 GIS 邊界圖資)](#49-public-靜態資源與-gis-邊界圖資)
   - [scripts/ (遷移與自動化腳本)](#410-scripts-遷移與自動化腳本)
   - [src/ (前端核心原始碼)](#411-src-前端核心原始碼)
   - [src/components/ (React 視圖與功能元件)](#412-srccomponents-react-視圖與功能元件)
   - [src/lib/ & src/services/ (資料存取與 API 封裝)](#413-srclib--srcservices-資料存取與-api-封裝)
   - [supabase/ (資料庫結構、設定與 SQL 腳本)](#414-supabase-資料庫結構設定與-sql-腳本)
   - [supabase/functions/ (Deno Edge Functions 雲端無伺服器函式)](#415-supabasefunctions-deno-edge-functions-雲端無伺服器函式)
5. [資料流與自動化運作機制](#5-資料流與自動化運作機制)

---

## 1. 系統整體架構與核心技術棧

```mermaid
flowchart TD
    subgraph 前端應用 [前端 SPA (Vite + React 19 + TypeScript)]
        MapUI[路燈主地圖 StreetLightMap]
        Officer[承辦人員 / 故障通報 FaultReportView]
        Maintenance[維修人員 / 施工回報 RepairReportView]
        Survey[現場基座調查 BaseSurveyView]
        Admin[管理單位 / 座標置換 ReplaceLightView]
        AdminDB[資料庫維護 AdminDatabaseView]
        PhotoUI[歷史照片瀏覽 LegacyPhotoBrowser]
    end

    subgraph 雲端後端 [Supabase Cloud]
        PG[(PostgreSQL Database)]
        Storage[(Supabase Storage: streetlight-photos)]
        FnUpload[Edge Fn: case-photo-upload-url]
        FnSync[Edge Fn: photo-drive-sync]
        FnBackup[Edge Fn: database-sheet-backup]
        FnLineNotif[Edge Fn: line-fault-notification]
        FnLineWebhook[Edge Fn: line-webhook]
    end

    subgraph 外部串接 [第三方服務整合]
        LINE[LINE 官方帳號 / 維修群組]
        GAS[Google Apps Script]
        GDrive[(Google Drive 備份資料夾)]
        GSheet[(Google Sheets 異地冷備份)]
    end

    subgraph 內網系統 [公所內部服務]
        MSSQL[(MS SQL Server: sanyi_檢視用)]
    end

    Officer -->|新增通報| PG
    Officer -->|送出通報後呼叫| FnLineNotif
    FnLineNotif -->|Flex Message 推播| LINE
    LINE -->|民眾聊天報修 Webhook| FnLineWebhook
    FnLineWebhook -->|寫入案件並推播| PG

    Maintenance -->|取得短效簽章 URL| FnUpload
    FnUpload -->|直傳修前/修後照| Storage
    Maintenance -->|更新完工狀態| PG

    Survey -->|回報基座調查照與座標| Storage
    Survey -->|寫入基座主檔| PG

    Admin -->|置換座標/村里判定| PG
    AdminDB -->|手動觸發備份| FnBackup
    FnBackup -->|匯出資料表| GAS
    GAS -->|寫入指定分頁| GSheet

    Storage -->|DB Trigger 佇列| FnSync
    FnSync -->|串流上傳| GAS
    GAS -->|分流存檔| GDrive

    PhotoUI -->|ODBC 查詢| MSSQL
```

### 技術棧清單
- **前端框架**：React 19、TypeScript 5.8、Vite 6.2 (支援 MPA 多入口建置與 SPA Hash 路由切換)
- **樣式與動態**：Tailwind CSS 4、Motion (Framer Motion)、Lucide React 圖示庫
- **GIS 地理資訊**：Leaflet 1.9、React Leaflet 5、Leaflet MarkerCluster (路燈聚合標記)、三義鄉村里 GeoJSON
- **影像與定位**：`exif-js`（現場照片 EXIF 時間提取）、瀏覽器 Geolocation API、點在多邊形演算法 (Point-in-Polygon)
- **雲端資料庫與儲存**：Supabase (PostgreSQL 15+、Row-Level Security、PostgREST、Storage Bucket)
- **雲端無伺服器 (Serverless)**：Deno-based Supabase Edge Functions
- **外部整合**：LINE Messaging API (Flex Message + Webhook)、Google Apps Script (GAS)、Google Drive API、Google Sheets API
- **內部系統整合**：Express 4、`mssql`、`msnodesqlv8`（支援 Windows ODBC Driver 17 整合驗證）

---

## 2. 系統角色與路由模組對照

| 角色 / 模組名稱 | 雜湊路由 (Hash Route) | 獨立 HTML 路徑 | 存取權限 | 主要功能描述 |
| :--- | :--- | :--- | :--- | :--- |
| **承辦人員** | `#/officer` | `index.html` | 公開存取 | 路燈座標與屬性查詢、未查修紅燈閃爍標記、查看待修清單、發起故障通報。 |
| **維修人員** | `#/maintenance` | `repair-report/index.html` | 免密碼快速入場 | 待修案件清單導覽、現場定位、修前／修後雙照片拍攝上傳、完工回報。 |
| **基座調查** | `#/survey` | `base-survey/index.html` | 公開存取 | 路燈基座現地勘查、自動讀取照片 EXIF 拍攝時間、基座照片上傳。 |
| **管理單位** | `#/admin` | `replacement/index.html` | 密碼保護 (`VITE_ADMIN_PASSWORD`) | 路燈經緯度置換、點在多邊形自動判斷村里、置換歷史軌跡與復原。 |
| **資料庫管理** | `#/admin`（資料庫視圖） | `admin/database/index.html` | 密碼保護 (`VITE_ADMIN_PASSWORD`) | 四大核心資料表 CRUD 管理、分頁搜尋、一鍵快照備份至 Google Sheets。 |
| **故障通報** | `#/officer/fault-report` | `fault-report/index.html` | 公開存取 | 依路燈編號填報故障情形，完成後自動觸發 LINE 群組 Flex Message 推播。 |
| **歷史照片瀏覽** | `#/photos` | `index.html` | 內網專用 | 檢視公所內部 MS SQL Server 保存之歷年路燈、配電箱二進位圖資照片。 |

---

## 3. 各資料夾功能詳細說明

```text
streetlightcodex/
├── .github/              # GitHub 自動化設定（CI/CD Workflow 定義）
├── .vscode/              # 整合開發環境 VS Code 編輯器配置
├── admin/                # 管理單位專用 HTML 多頁面進入點
│   └── database/         # 資料庫後台管理獨立 HTML 進入點
├── base-survey/          # 路燈基座調查獨立 HTML 進入點
├── fault-report/         # 民眾與承辦人員路燈故障通報獨立 HTML 進入點
├── public/               # Vite 靜態資源公開目錄（含 GIS 向量地圖）
│   └── data/             # GIS GeoJSON 圖資與靜態測試資料
├── repair-report/        # 維修人員現場查修回報獨立 HTML 進入點
├── replacement/          # 路燈座標置換與村里判定獨立 HTML 進入點
├── scripts/              # 離線遷移腳本與 Google Apps Script (GAS) 部署程式
├── src/                  # 前端核心應用程式碼
│   ├── components/       # React 視圖與各功能模組元件
│   ├── lib/              # 底層函式庫（Supabase Client、Storage 上傳封裝）
│   └── services/         # 業務資料存取層 (Data Access Layer)
└── supabase/             # Supabase 後端配置、SQL 結構、自動化觸發器與 Edge Functions
    └── functions/        # Deno 執行的 Supabase Serverless Edge Functions
```

---

## 4. 專案各檔案詳細作用清單

### 4.1 根目錄設定與核心檔案

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`.env.example`](file:///d:/where1223/AI/streetlightcodex/.env.example) | **環境變數範本檔**。定義前端所需的 Supabase 連線參數（URL、Publishable Key）、Gemini API Key、管理員預設密碼及本機 SQL Server 連線設定說明。 |
| [`.env.local`](file:///d:/where1223/AI/streetlightcodex/.env.local) | **本機環境變數實體檔**（已列入 `.gitignore`）。存放本機開發時實際連線之 Supabase 與 SQL Server 設定。 |
| [`.gitignore`](file:///d:/where1223/AI/streetlightcodex/.gitignore) | **Git 忽略規則清單**。排除 `node_modules`、`dist`、`.env.local`、`.temp`、備份目錄 `bak` 等不應提交之檔案。 |
| [`index.html`](file:///d:/where1223/AI/streetlightcodex/index.html) | **SPA 主入口 HTML**。包含 `<div id="root"></div>` 並載入 `src/main.tsx`，為路燈地圖與主應用的進入點。 |
| [`metadata.json`](file:///d:/where1223/AI/streetlightcodex/metadata.json) | **應用程式元數據檔**。定義應用程式名稱（Sanyi Street Light Map）、功能描述以及向瀏覽器申請的權限（如 `geolocation` 地理定位）。 |
| [`package.json`](file:///d:/where1223/AI/streetlightcodex/package.json) | **Node.js 專案設定與套件依賴清單**。定義開發與生產依賴（React 19、Tailwind CSS 4、Leaflet、Supabase、Motion、mssql、exif-js）及 npm 執行腳本（`dev`, `build`, `lint`, `migrate:supabase` 等）。 |
| [`package-lock.json`](file:///d:/where1223/AI/streetlightcodex/package-lock.json) | **npm 依賴套件版本鎖定檔**。確保跨環境安裝時相依套件版本完全一致。 |
| [`README.md`](file:///d:/where1223/AI/streetlightcodex/README.md) | **原始專案說明文件**。包含路燈系統初期開發之說明與歷史參考紀錄。 |
| [`newreadme.md`](file:///d:/where1223/AI/streetlightcodex/newreadme.md) | **既有架構整合文件**。記載前一版架構說明。 |
| [`new-readme.md`](file:///d:/where1223/AI/streetlightcodex/new-readme.md) | **本文件**。全專案資料夾與檔案之完整詳細作用清單指南。 |
| [`tsconfig.json`](file:///d:/where1223/AI/streetlightcodex/tsconfig.json) | **TypeScript 編譯設定檔**。配置編譯目標（ES2022）、JSX 轉換模式（`react-jsx`）、型別檢查嚴格度及模組解析規則。 |
| [`vite.config.ts`](file:///d:/where1223/AI/streetlightcodex/vite.config.ts) | **Vite 建置與打包配置**。配置 Tailwind CSS 插件、React 插件、路徑別名（`@`）、GitHub Pages 子路徑（`base: '/streetlightcodex/'`）以及 7 個獨立 HTML 多頁面 Rollup 入口（main, admin, faultReport, replacement, repairReport, baseSurvey, adminDatabase）。 |

---

### 4.2 .github/ (CI/CD 自動化部署)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`.github/workflows/deploy.yml`](file:///d:/where1223/AI/streetlightcodex/.github/workflows/deploy.yml) | **GitHub Actions CI/CD 工作流程**。當程式碼推送到 `main` 分支時自動觸發：設定 Node.js 20 環境、執行 TypeScript 型別檢查（`npm run lint`）、注入 Secrets 並執行編譯（`npm run build`），最終將 `dist/` 靜態產物發布至 **GitHub Pages**。 |

---

### 4.3 .vscode/ (編輯器設定)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`.vscode/settings.json`](file:///d:/where1223/AI/streetlightcodex/.vscode/settings.json) | **VS Code 工作區客製化設定檔**。供開發團隊統一編輯器行為。 |

---

### 4.4 admin/ & admin/database/ (管理員後台入口)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`admin/index.html`](file:///d:/where1223/AI/streetlightcodex/admin/index.html) | **管理單位入口 HTML**。提供獨立乾淨的 `/admin/` 網址供公所管理人員登入並進行權限控管與座標置換作業。 |
| [`admin/database/index.html`](file:///d:/where1223/AI/streetlightcodex/admin/database/index.html) | **資料庫管理後台入口 HTML**。提供獨立 `/admin/database/` 網址，載入 `AdminDatabaseView` 元件，進行資料表維護與 Google Sheets 備份。 |

---

### 4.5 base-survey/ (基座調查入口)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`base-survey/index.html`](file:///d:/where1223/AI/streetlightcodex/base-survey/index.html) | **基座調查系統獨立 HTML**。提供 `/base-survey/` 網址，專供現場勘查人員快速開啟基座調查相機介面。 |

---

### 4.6 fault-report/ (故障通報入口)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`fault-report/index.html`](file:///d:/where1223/AI/streetlightcodex/fault-report/index.html) | **故障通報獨立 HTML**。提供 `/fault-report/` 網址，供民眾或承辦人直接針對特定路燈快速填寫報修案件。 |

---

### 4.7 repair-report/ (維修回報入口)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`repair-report/index.html`](file:///d:/where1223/AI/streetlightcodex/repair-report/index.html) | **維修回報系統獨立 HTML**。提供 `/repair-report/` 網址，外勤維修工班點擊即可開啟待修案件清單與施工照片上傳回報畫面。 |

---

### 4.8 replacement/ (座標置換入口)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`replacement/index.html`](file:///d:/where1223/AI/streetlightcodex/replacement/index.html) | **路燈置換系統獨立 HTML**。提供 `/replacement/` 網址，載入 `ReplaceLightView` 進行點位校正、村里判斷與置換歷程查閱。 |

---

### 4.9 public/ (靜態資源與 GIS 邊界圖資)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`public/data/Sanyi_villages.geojson`](file:///d:/where1223/AI/streetlightcodex/public/data/Sanyi_villages.geojson) | **三義鄉各村里 GIS GeoJSON 邊界圖資**。包含廣盛村(01)、雙湖村(02)、雙潭村(03)、勝興村(04)、西湖村(05)、龍騰村(06)、鯉魚潭村(07)之多邊形邊界與屬性，供地圖繪製村界多邊形及射線演算法判斷座標所屬村里。 |
| [`public/data/test.json`](file:///d:/where1223/AI/streetlightcodex/public/data/test.json) | **靜態測試 JSON 檔**。供連線與資源載入測試使用。 |

---

### 4.10 scripts/ (遷移與自動化腳本)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`scripts/migrate-google-to-supabase.mjs`](file:///d:/where1223/AI/streetlightcodex/scripts/migrate-google-to-supabase.mjs) | **Google Sheets 至 Supabase 資料遷移腳本 (Node.js ESM)**。透過 OpenSheet API 讀取原公所 Google Sheet 的「路燈位置參考」與「回復表-路燈查修-升冪」，將時間字串轉換為台北時區 ISO 格式，批次 Upsert 寫入 Supabase `streetlights` 與 `repair_reports` 資料表。 |
| [`scripts/photo-drive-gas.js`](file:///d:/where1223/AI/streetlightcodex/scripts/photo-drive-gas.js) | **Google Apps Script (GAS) 部署端腳本**。部署為 Google Web App，具備雙重功能：(1) 接收 Supabase Edge Function 轉發的照片下載 URL，以串流方式上傳到指定 Google Drive 資料夾（基座、置換、維修各自獨立目錄）；(2) 接收資料庫快照 payload，覆寫至指定 Google Sheets 試算表完成冷備份。 |

---

### 4.11 src/ (前端核心原始碼)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`src/main.tsx`](file:///d:/where1223/AI/streetlightcodex/src/main.tsx) | **React 應用程式根進入點**。利用 React 19 `createRoot` 將 `<App />` 元件掛載至 DOM `#root` 節點。 |
| [`src/App.tsx`](file:///d:/where1223/AI/streetlightcodex/src/App.tsx) | **應用程式主元件與路由中樞**。負責解析網址 Path 與 Hash 路由（`#/officer`, `#/maintenance`, `#/survey`, `#/admin` 等）、載入 `Sanyi_villages.geojson` 村里圖資、管理管理員密碼身分認證（LocalStorage 狀態快取），並動態渲染對應的功能視圖元件。 |
| [`src/constants.ts`](file:///d:/where1223/AI/streetlightcodex/src/constants.ts) | **系統全域常數定義**。定義 Google Sheets 試算表 ID、各工作表名稱、預設地圖中心點座標（三義鄉 `[24.4126, 120.6845]`）、預設縮放層級（14）與 GAS Web App 端點網址。 |
| [`src/types.ts`](file:///d:/where1223/AI/streetlightcodex/src/types.ts) | **TypeScript 型別定義檔**。宣告 `StreetLightLocation`、`RepairRecord`、`StreetLightData`、`HistoryRecord` 等核心資料結構介面。 |
| [`src/global.d.ts`](file:///d:/where1223/AI/streetlightcodex/src/global.d.ts) | **全域環境宣告檔**。定義全域環境擴充宣告。 |
| [`src/vite-env.d.ts`](file:///d:/where1223/AI/streetlightcodex/src/vite-env.d.ts) | **Vite Client 型別宣告檔**。引入 Vite 內建環境變數（`import.meta.env`）型別支援。 |
| [`src/index.css`](file:///d:/where1223/AI/streetlightcodex/src/index.css) | **全域樣式表**。導入 Tailwind CSS 4、Leaflet 基礎樣式、MarkerCluster 聚合樣式、路燈點位閃爍動畫（`@keyframes blink`）及村里文字標籤樣式。 |

---

### 4.12 src/components/ (React 視圖與功能元件)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`src/components/StreetLightMap.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/StreetLightMap.tsx) | **主地圖 GIS 核心元件**。以 Leaflet 與 React-Leaflet 為底層，渲染三義鄉村里邊界向量圖層、標記聚合（MarkerCluster）、路燈編號即時搜尋定位（金色大標記）、未查修紅色呼吸燈閃爍標記；提供點擊路燈彈窗檢視歷史查修紀錄與屬性，並可一鍵跳轉至故障通報、維修回報、基座調查及管理後台。 |
| [`src/components/FaultReportView.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/FaultReportView.tsx) | **路燈故障通報視圖**。提供承辦人員與民眾輸入路燈編號（支援 Auto-complete 資料清單）、選擇故障類型（不亮、閃爍、白天仍亮、燈桿傾斜等）、填寫通報人與電話；送出後寫入 `repair_reports` 並自動觸發後端 `line-fault-notification` 傳送 LINE Flex 訊息。 |
| [`src/components/RepairReportView.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/RepairReportView.tsx) | **維修回報視圖**。外勤維修人員作業專用，自動讀取待查修案件列表；支援現場相機拍照，透過 EXIF 自動取得時間與座標，上傳維修前／維修後對照照片，填寫完工備註並更新案件狀態為「已查修」。 |
| [`src/components/RepairReportView.css`](file:///d:/where1223/AI/streetlightcodex/src/components/RepairReportView.css) | **維修與調查視圖專屬樣式表**。為行動裝置觸控體驗優化的大按鈕、卡片式佈局、相機取景框及進度條樣式。 |
| [`src/components/BaseSurveyView.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/BaseSurveyView.tsx) | **路燈基座現地調查視圖**。供調查人員現場即時 GPS 定位、拍攝基座施工前後照片、解析 EXIF 時間，並將調查數據（桿高、座型、座標、照片）提交至 Supabase 與 Google Drive。 |
| [`src/components/ReplaceLightView.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/ReplaceLightView.tsx) | **路燈座標置換與管理視圖**。管理員可搜尋既有路燈或新增路燈，利用內建的射線多邊形判定演算法（Point in Polygon）依據經緯度自動計算所屬村里；支援上傳現場照片、記錄每次座標位移前後歷史軌跡，並支援置換紀錄的多選批次刪除與復原。 |
| [`src/components/AdminDatabaseView.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/AdminDatabaseView.tsx) | **資料庫綜合管理視圖**。管理員專屬後台，可切換瀏覽 `streetlights`（路燈主檔）、`repair_reports`（報修查修）、`replacement_history`（置換歷程）、`base_surveys`（基座調查）四大資料表；提供資料即時搜尋、分頁、行內檢視與編輯對話框、新增/刪除資料列，以及一鍵觸發 Edge Function 將完整資料表快照備份至 Google Sheets。 |
| [`src/components/LegacyPhotoBrowser.tsx`](file:///d:/where1223/AI/streetlightcodex/src/components/LegacyPhotoBrowser.tsx) | **本機歷史照片瀏覽器元件**。連線本機 Express 服務（端口 4174），讀取內部 SQL Server 的歷史路燈、配電箱、歷年工程案件照片二進位影像，支援路燈編號全文檢索與縮圖相簿導覽。 |

---

### 4.13 src/lib/ & src/services/ (資料存取與 API 封裝)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`src/lib/supabase.ts`](file:///d:/where1223/AI/streetlightcodex/src/lib/supabase.ts) | **Supabase 底層通訊與封裝庫**。封裝 PostgREST REST API 的 `supabaseSelect`, `supabaseSelectAll`（自動處理 1000 筆分頁抓取避免資料被截斷）、`supabaseInsert`, `supabaseUpdate`, `supabaseDelete`；封裝簽章照片上傳 `uploadCasePhoto`、LINE 通知呼叫 `notifyFaultReport` 與資料庫備份呼叫 `backupTableToGoogleSheet`。 |
| [`src/services/database.ts`](file:///d:/where1223/AI/streetlightcodex/src/services/database.ts) | **業務資料層 (Data Access Layer)**。向上提供 React 元件乾淨的非同步呼叫介面：`getStreetlights`, `getRepairRecords`, `getPendingRepairs`, `createRepairReport`, `completeRepair`, `saveBaseSurvey`, `getReplacementHistory`, `saveStreetlight`, `deleteReplacementHistory`。 |

---

### 4.14 supabase/ (資料庫結構、設定與 SQL 腳本)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`supabase/config.toml`](file:///d:/where1223/AI/streetlightcodex/supabase/config.toml) | **Supabase CLI 與 Edge Functions 部署配置**。設定 `photo-drive-sync`, `case-photo-upload-url`, `line-fault-notification`, `line-webhook` 函式的 JWT 驗證規則（`verify_jwt = false`）。 |
| [`supabase/schema.sql`](file:///d:/where1223/AI/streetlightcodex/supabase/schema.sql) | **PostgreSQL 資料庫主要結構定義檔**。建立核心資料表（`streetlights`, `repair_reports`, `replacement_history`, `base_surveys`, `photo_transfers`, `photo_sync_settings`）、空間與查詢索引、Row Level Security (RLS) 安全策略、Storage Bucket (`streetlight-photos`) 以及上傳自動加入佇列之觸發器。 |
| [`supabase/configure-photo-drive-retries.sql`](file:///d:/where1223/AI/streetlightcodex/supabase/configure-photo-drive-retries.sql) | **照片同步重試機制 SQL 設定**。透過 `pg_cron` 每 10 分鐘檢查失敗或中斷之照片傳輸任務，限制最多重試 4 次，並提供 `claim_photo_transfers` 悲觀鎖定機制避免重複處理。 |
| [`supabase/enable-immediate-photo-drive-sync.sql`](file:///d:/where1223/AI/streetlightcodex/supabase/enable-immediate-photo-drive-sync.sql) | **啟用即時同步觸發 SQL 腳本**。透過 `pg_net` 擴充套件，當照片寫入 Storage 後立即向 `photo-drive-sync` Edge Function 發送非同步 HTTP POST 請求，達成秒級同步。 |
| [`supabase/migrate-photo-paths-by-light-id.sql`](file:///d:/where1223/AI/streetlightcodex/supabase/migrate-photo-paths-by-light-id.sql) | **照片路徑以路燈編號命名之正規化遷移腳本**。將 Storage 照片路徑統一轉換為 `{路燈編號}_{before|after}.jpg` 格式，簡化檔案追蹤與對照。 |
| [`supabase/photo-drive-sync-cron.sql.example`](file:///d:/where1223/AI/streetlightcodex/supabase/photo-drive-sync-cron.sql.example) | **Cron 排程與 Vault 密鑰設定範例**。展示如何將 Supabase Project URL 與 Cron Secret 寫入 `vault.secrets`，並設定 `cron.schedule` 每分鐘排程。 |
| [`supabase/photo-drive-sync.md`](file:///d:/where1223/AI/streetlightcodex/supabase/photo-drive-sync.md) | **照片同步至 Google Drive 之架構文件**。說明 Storage → Trigger → Edge Function → GAS → Google Drive 之完整流程與 Secret 設定指引。 |
| [`supabase/database-sheet-backup.md`](file:///d:/where1223/AI/streetlightcodex/supabase/database-sheet-backup.md) | **資料庫備份至 Google Sheets 之說明文件**。說明管理者如何觸發備份、資料格式轉換與 GAS Web App 端點配置。 |
| [`supabase/line-fault-notification.md`](file:///d:/where1223/AI/streetlightcodex/supabase/line-fault-notification.md) | **LINE 故障推播設定說明文件**。指引如何向 Supabase 設定 `LINE_CHANNEL_ACCESS_TOKEN` 與 `LINE_GROUP_ID` Secrets。 |

---

### 4.15 supabase/functions/ (Deno Edge Functions 雲端無伺服器函式)

| 檔案路徑 | 作用與功能詳細說明 |
| :--- | :--- |
| [`supabase/functions/case-photo-upload-url/index.ts`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/case-photo-upload-url/index.ts) | **簽章上傳網址產生器 (Edge Function)**。接收前端傳入的案件 ID、類別（repair / base-survey / replacement）與插槽，驗證案件存在後，利用 Service Role 權限向 Supabase Storage 申請一組具時效性且限制路徑的 Signed Upload URL，使前端能在不暴露私鑰的情況下直接將大檔照片直傳至雲端 Storage。 |
| [`supabase/functions/photo-drive-sync/index.ts`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/photo-drive-sync/index.ts) | **照片非同步同步至 Google Drive (Edge Function)**。由 Cron 或 Database Trigger 觸發，從 `photo_transfers` 佇列領取待處理任務，將暫存於 Storage 的照片下載網址派送至 GAS Web App 轉存至公所 Google Drive；確認 Drive 上傳成功後，回寫 Drive ID / URL 至資料庫並刪除 Storage 暫存照片以節省儲存空間。 |
| [`supabase/functions/photo-drive-sync/deno.json`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/photo-drive-sync/deno.json) | **`photo-drive-sync` Deno 配置檔**。宣告函式執行環境設定。 |
| [`supabase/functions/database-sheet-backup/index.ts`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/database-sheet-backup/index.ts) | **資料庫覆寫備份至 Google Sheets (Edge Function)**。接收指定資料表名稱（`streetlights`, `repair_reports`, `replacement_history`, `base_surveys`），分頁讀取所有資料列，轉換時間為台北時區格式，打包發送至 GAS Web App 完整覆寫至對應的 Google Sheet 工作表。 |
| [`supabase/functions/line-fault-notification/index.ts`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/line-fault-notification/index.ts) | **LINE 故障通報群組推播 (Edge Function)**。當案件建立後觸發，讀取通報內容與路燈經緯度，組裝包含通報時間、路燈號碼、故障情形、通報人與 Google Maps 導航按鈕的 **LINE Flex Message**，推播至維修工班 LINE 群組。 |
| [`supabase/functions/line-webhook/index.ts`](file:///d:/where1223/AI/streetlightcodex/supabase/functions/line-webhook/index.ts) | **LINE 官方帳號 Webhook 接收器 (Edge Function)**。接收 LINE 傳入之 Webhook 請求，進行 HMAC-SHA256 簽名驗證；利用正規表示式自動解析使用者輸入之訊息（例如「01001 路燈不亮」），自動比對路燈編號並建立 `repair_reports` 紀錄，同時自動回復處理結果給通報人。 |

---

## 5. 資料流與自動化運作機制

### 5.1 現場維修照片上傳與 Google Drive 同步流程
1. 維修人員在 `RepairReportView` 拍照並確認完工回報。
2. 前端呼叫 `case-photo-upload-url` 取得短效 Signed URL，直接將照片 PUT 上傳至 Supabase Storage `streetlight-photos` Bucket。
3. Storage 寫入事件觸發 PostgreSQL Trigger `queue_streetlight_photo`，自動在 `photo_transfers` 表中插入一筆 `pending` 紀錄，並透過 `pg_net` 立即呼叫 `photo-drive-sync` Edge Function。
4. `photo-drive-sync` 呼叫 GAS Web App (`scripts/photo-drive-gas.js`)，GAS 以公所帳號權限將照片抓取並存入對應 Google Drive 資料夾（`repair` / `base-survey` / `replacement`）。
5. 回傳 Drive File ID 與檢視 URL，更新回 `repair_reports` 資料表，並將 Storage 中的暫存圖片移除。

### 5.2 LINE 故障通報與推播流程
1. **網頁通報**：承辦人或民眾在 `FaultReportView` 送出通報 → 寫入 `repair_reports` → 呼叫 `line-fault-notification` → 推播 LINE Flex 訊息至維修群組。
2. **LINE Bot 通報**：民眾傳送訊息至官方帳號（如「02015不亮」） → 觸發 `line-webhook` → 解析路燈編號與故障詞彙 → 寫入 `repair_reports` → 觸發群組推播並向民眾回覆確認訊息。

### 5.3 管理者冷備份至 Google Sheets 流程
1. 管理者進入 `AdminDatabaseView`，點擊「備份至 Google Sheet」。
2. 前端呼叫 `database-sheet-backup` Edge Function。
3. Edge Function 以 1000 筆為單位讀取目標資料表全部資料，轉換台北時區時間，POST 至 GAS Web App。
4. GAS 清空試算表該工作表舊內容，批次寫入新標題與資料列，完成異地冷備份。
