# 🏮 三義鄉路燈管理系統 (streetlightcodex)

專為苗栗縣三義鄉公所設計之綜合性路燈地理資訊、巡檢報修、維修回報、基座調查與歷史座標置換管理系統。整合 GIS 地圖圖資（Leaflet）、Supabase 雲端資料庫／物件儲存、Google Drive 自動化非同步備份，以及內網專用的 SQL Server 本機歷史照片瀏覽服務。

---

## 📑 目錄

1. [系統架構與技術棧](#系統架構與技術棧)
2. [角色入口與路由說明](#角色入口與路由說明)
3. [快速開始與本機開發](#快速開始與本機開發)
4. [環境變數設定 (.env.local)](#環境變數設定-envlocal)
5. [常用指令 (NPM Scripts)](#常用指令-npm-scripts)
6. [資料庫 Schema 與 Supabase 設定](#資料庫-schema-與-supabase-設定)
7. [Edge Functions 與後端服務](#edge-functions-與後端服務)
8. [本機 SQL Server 照片瀏覽伺服器](#本機-sql-server-照片瀏覽伺服器)
9. [自動化部署 (CI/CD)](#自動化部署-cicd)
10. [專案目錄結構](#專案目錄結構)

---

## 系統架構與技術棧

```mermaid
flowchart TD
    subgraph 前端應用 [前端 SPA (Vite + React 19)]
        Officer[承辦人員 #/officer]
        Maintenance[維修人員 #/maintenance]
        Survey[基座調查 #/survey]
        Admin[管理單位 #/admin]
        PhotoUI[照片檢視 #/photos]
    end

    subgraph 雲端後端 [Supabase Backend]
        PG[(Postgres Database)]
        Storage[(Case Photos Storage)]
        FnUpload[Edge Fn: case-photo-upload-url]
        FnSync[Edge Fn: photo-drive-sync]
        FnBackup[Edge Fn: database-sheet-backup]
    end

    subgraph 外部整合 [Google Cloud Workspace]
        GAS[Google Apps Script]
        GDrive[(Google Drive 備份資料夾)]
        GSheet[(Google Sheets 異動備份)]
    end

    subgraph 內網服務 [本機 Intranet 服務]
        Server[Express Server :4174]
        SQL[(MS SQL Server: sanyi_檢視用)]
    end

    Officer -->|讀取/通報| PG
    Maintenance -->|更新案件/簽章上傳| FnUpload
    FnUpload --> Storage
    Maintenance -->|狀態更新| PG
    Survey -->|回報基座| PG
    Admin -->|置換座標/歷程| PG
    Admin -->|觸發備份| FnBackup
    FnBackup --> GSheet
    Storage -->|WebHook/Cron| FnSync
    FnSync --> GAS
    GAS --> GDrive
    PhotoUI --> Server
    Server --> SQL
```

### 主要技術清單
- **前端核心**：React 19 (`react`, `react-dom`)、TypeScript 5.8、Vite 6.2
- **樣式與動畫**：Tailwind CSS 4、Motion (Framer Motion)、Lucide React 圖示庫
- **地圖與 GIS**：Leaflet、`react-leaflet`、`leaflet.markercluster`、三義鄉村里 GeoJSON 邊界資料
- **影像處理**：`exif-js`（現場照片拍攝時間自動提取）
- **雲端資料庫**：Supabase Postgres、Supabase Storage、Supabase Edge Functions (Deno)
- **非同步備份**：Google Apps Script (GAS)、Google Drive API、Google Sheets
- **本機伺服器**：Express 4、`mssql`、`msnodesqlv8` (ODBC Driver 17 Windows 整合驗證)

---

## 角色入口與路由說明

系統透過 Hash Routing 分流不同權限與作業人員：

| 角色／功能 | 雜湊路由 URL | 主要職責與操作 | 權限要求 |
| :--- | :--- | :--- | :--- |
| **承辦人員** | `#/officer` | 地圖查詢路燈座標、檢視未查修清單、發起故障通報案件 | 公開存取 |
| **維修人員** | `#/maintenance` | 現場定位導航、待修案件接單、拍攝並上傳修前／修後對比照片、回報修復完工狀態 | 公開存取（免密碼加速施工） |
| **基座調查** | `#/survey` | 定位調查現場路燈基座狀況、記錄路名／燈桿高度／基座型號、現場照片上傳 | 公開存取 |
| **管理單位** | `#/admin` | 路燈座標批次置換（自動計算村里）、異動歷史軌跡查閱、資料庫手動備份至 Google Sheet | 需驗證 `VITE_ADMIN_PASSWORD` |
| **歷史照片瀏覽器** | `#/photos` | 透過本機服務檢視內網 SQL Server 儲存之歷史路燈、配電箱、歷年工程案件照片 | 需啟動本機 Express 伺服器 |

---

## 快速開始與本機開發

### 必要條件
1. **Node.js**：>= 20.0.0
2. **npm**：>= 10.0.0
3. **Supabase 專案**（或可存取的本機 Supabase 實例）
4. **ODBC Driver 17 for SQL Server**（僅本機照片瀏覽伺服器需要）

### 本機安裝與啟動
```bash
# 1. 下載套件依賴
npm ci

# 2. 複製環境變數設定檔
Copy-Item .env.example .env.local

# 3. 啟動 Vite 開發伺服器 (預設 0.0.0.0:3000)
npm run dev
```

開發伺服器啟動後，瀏覽：
- `http://localhost:3000/#/officer`
- `http://localhost:3000/#/maintenance`
- `http://localhost:3000/#/survey`
- `http://localhost:3000/#/admin`

---

## 環境變數設定 (.env.local)

請於專案根目錄建立 `.env.local` 檔案（此檔案已加入 `.gitignore`，切勿提交至 Git）：

```env
# ==========================================
# 1. Supabase 雲端設定 (瀏覽器公開可見)
# ==========================================
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_YOUR_KEY"

# ==========================================
# 2. 管理者後台密碼 (請在 GitHub Secrets 設定相同值)
# ==========================================
VITE_ADMIN_PASSWORD="請設定安全隨機密碼"

# ==========================================
# 3. 本機 SQL Server 歷史照片伺服器 (選用)
# ==========================================
PHOTO_BROWSER_HOST="0.0.0.0"
PHOTO_BROWSER_PORT="4174"
PHOTO_BROWSER_SQL_DRIVER="ODBC Driver 17 for SQL Server"
PHOTO_BROWSER_SQL_SERVER="localhost\\SQLEXPRESS"
PHOTO_BROWSER_SQL_DATABASE="sanyi_檢視用"
PHOTO_BROWSER_SQL_ENCRYPT="No"
```

> [!WARNING]
> `VITE_*` 開頭之環境變數將於建置階段打包進前端靜態 JavaScript 檔案中，**嚴禁存放 Supabase `service_role` 私鑰、資料庫連線密碼或 Google Apps Script 敏感 Token**。

---

## 常用指令 (NPM Scripts)

| 指令 | 說明 |
| :--- | :--- |
| `npm run dev` | 啟動 Vite 本機開發環境，支援局域網連線 (`--host=0.0.0.0 --port=3000`) |
| `npm run build` | 執行 Vite 編譯與打包，產出靜態網站至 `dist/` 目錄 |
| `npm run preview` | 預覽本機 `dist/` 打包產出 |
| `npm run lint` | 執行 TypeScript 型別檢查 (`tsc --noEmit`) |
| `npm run clean` | 清除 `dist/` 編譯目錄 |
| `npm run migrate:supabase` | 執行 Google Sheets 至 Supabase 的資料遷移腳本 |
| `npm run photos:server:sqlserver` | 啟動 Windows 整合驗證之 SQL Server 歷史照片後端 API |

---

## 資料庫 Schema 與 Supabase 設定

資料庫 Schema 定義於 `supabase/schema.sql`，主要資料表如下：

1. **`streetlights` (路燈基底資料)**
   - `id` (text, primary key)：路燈編號（如：`双湖-001`）
   - `latitude` (numeric)：緯度
   - `longitude` (numeric)：經度
   - `STREET`, `STYPE`, `SEAT`, `HEIGHT`：道路名稱、燈具類型、基座型號、燈桿高度
   - `metadata` (jsonb)：擴充欄位與原始匯入資料
2. **`repair_reports` (查修通報與維修紀錄)**
   - `id` (bigserial, primary key)
   - `streetlight_id` (text, foreign key)
   - `reported_at` (timestamptz)：通報時間
   - `fault` (text)：故障情形（例如：不亮、閃爍、外線斷落）
   - `status` (text)：查修情形（例如：`未查修`、`已修復`）
   - `before_photo_url`, `after_photo_url` (text)：修前／修後照片連結
   - `note` (text)：現場備註或維修細節
3. **`streetlight_history` (座標異動歷程)**
   - 記錄路燈經緯度位移、原編號置換、變更人員與操作時間。
4. **`base_surveys` (基座現地調查)**
   - 記錄路燈基座型態、桿高現場調查結果與勘查照片。
5. **`photo_drive_sync_queue` (照片備份同步佇列)**
   - 記錄上傳至 Supabase Storage 的照片非同步備份狀態（`pending`, `processing`, `synced`, `failed`）。

---

## Edge Functions 與後端服務

專案包含三組 Deno 運行的 Supabase Edge Functions：

1. **`case-photo-upload-url`** (`supabase/functions/case-photo-upload-url/index.ts`)
   - 產生 Supabase Storage 的簽章上傳網址 (Signed Upload URL)，允許前端維修與調查人員直接將現場大檔照片直傳至 Storage Bucket，無需暴露私鑰。
2. **`photo-drive-sync`** (`supabase/functions/photo-drive-sync/index.ts`)
   - 監聽或排程讀取 `photo_drive_sync_queue`，將現場照片以串流方式上傳轉存至公所指定 Google Drive，並回寫檔案 ID 與下載連結。
3. **`database-sheet-backup`** (`supabase/functions/database-sheet-backup/index.ts`)
   - 由管理者後台觸發，將當前最新路燈、查修及置換資料以快照形式覆寫回 Google Sheets，作為異地冷備份。

---

## 本機 SQL Server 照片瀏覽伺服器

公所早期之歷史照片（含路燈、配電箱、工程圖資）存放於內部 Windows SQL Server Express (`sanyi_檢視用`)。

- **後端腳本**：`server/photo-browser-server.mjs`
- **啟動方式**：
  ```bash
  npm run photos:server:sqlserver
  ```
- **運作機制**：透過 `msnodesqlv8` 使用 Windows 整合驗證 (Integrated Authentication / Trusted Connection) 連線，提供 REST API 供前端 `#/photos` 畫面依路燈編號或相簿分頁查詢二進位影像。

---

## 自動化部署 (CI/CD)

專案已配置 GitHub Actions 部署工作流程 (`.github/workflows/deploy.yml`)：

1. **觸發條件**：推送程式碼至 `main` 分支。
2. **執行流程**：
   - 設定 Node.js 20 環境
   - 執行 `npm ci`
   - 執行 `npm run lint` 檢查 TypeScript 型別
   - 注入環境變數執行 `npm run build`
   - 部署靜態檔案至 **GitHub Pages**
3. **GitHub Repository Secrets 設定**：
   - 請至 **Settings → Secrets and variables → Actions** 加入：
     - `VITE_ADMIN_PASSWORD`：管理員頁面解鎖金鑰

---

## 專案目錄結構

```text
streetlightcodex/
├── .github/workflows/       # GitHub Actions 自動建置與部署 workflow
├── data/                    # 離線備份與輔助資料
├── public/                  # 靜態資源目錄
│   └── data/
│       └── Sanyi_villages.geojson  # 三義鄉各村里 GIS 邊界 GeoJSON
├── scripts/                 # 遷移腳本與 Google Apps Script
│   ├── migrate-google-to-supabase.mjs # Google Sheets 資料遷移至 Supabase
│   └── photo-drive-gas.js             # Google Drive 照片備份 GAS
├── server/                  # 本機 Express + SQL Server API 伺服器
│   └── photo-browser-server.mjs
├── src/                     # 前端應用核心程式碼
│   ├── components/          # React 頁面與視圖元件
│   │   ├── AdminDatabaseView.tsx  # 管理者資料庫管理與備份
│   │   ├── BaseSurveyView.tsx     # 基座調查作業畫面
│   │   ├── FaultReportView.tsx    # 承辦人員故障通報畫面
│   │   ├── RepairReportView.tsx   # 維修人員查修回報與照片上傳
│   │   ├── ReplaceLightView.tsx   # 路燈位置置換與村里判定
│   │   └── StreetLightMap.tsx     # 主地圖展示與點位圖層
│   ├── lib/
│   │   └── supabase.ts      # Supabase Client 與 REST/Storage 封裝
│   ├── services/
│   │   └── database.ts      # 業務邏輯資料層 (Data Access Layer)
│   ├── App.tsx              # 應用主進入點與 Hash 路由分發
│   ├── constants.ts         # 系統常數 (Google Sheet ID、地圖中心點)
│   ├── types.ts             # 核心 TypeScript 型別宣告
│   └── main.tsx             # React 根節點掛載
├── supabase/                # Supabase 設定與 Edge Functions
│   ├── functions/           # Deno Edge Functions
│   └── schema.sql           # Postgres 資料表、RLS 與佇列定義
├── .env.example             # 環境變數範本檔
├── package.json             # 專案依賴與腳本定義
├── tsconfig.json            # TypeScript 編譯設定
├── vite.config.ts           # Vite 建置與插件設定
└── README.md                # 專案說明文件
```

