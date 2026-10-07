# 三義鄉路燈管理系統

三義鄉公所使用的路燈資料、報修查修、基座調查與置換歷程管理系統。前台以地圖呈現路燈與案件，資料主要儲存於 Supabase；案件照片可由背景工作同步備份到 Google Drive。專案另提供僅限內網電腦使用的 SQL Server 歷史照片瀏覽器。

## 功能一覽

| 身分／工具 | 可用功能 |
| --- | --- |
| 承辦人員 | 地圖查詢、待修案件查看、故障通報 |
| 維修人員 | 地圖查詢、待修案件查看、完工回報與維修前後照片上傳 |
| 基座調查 | 路燈基座調查、定位及照片上傳 |
| 管理單位 | 路燈位置置換、異動歷程、資料庫管理及 Google Sheet 備份 |
| 本機照片瀏覽器 | 瀏覽 Windows SQL Server 中的路燈、配電箱、維修、工程與歷史照片 |

## 技術組成

- 前端：React 19、TypeScript、Vite、Tailwind CSS、Leaflet
- 雲端資料：Supabase Postgres、Storage、Edge Functions
- 照片備份：Supabase Storage → Edge Function → Google Apps Script → Google Drive
- 既有資料匯入：Google Sheets（一次性／按需匯入）
- 本機瀏覽器：Express、Windows Integrated Authentication、SQL Server Express
- 部署：GitHub Actions 與 GitHub Pages

## 快速開始

### 必要條件

- Node.js 20 或更新版本
- npm
- 若要使用雲端資料：Supabase 專案與 publishable key
- 若要使用本機照片瀏覽器：Windows、SQL Server Express 與 ODBC Driver 17 for SQL Server

### 安裝與啟動前端

```bash
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Vite 開發伺服器預設使用 `http://localhost:3000`。前端角色入口使用雜湊路由：

```text
#/officer      承辦人員
#/maintenance  維修人員
#/survey       基座調查
#/admin        管理單位
```

## 環境變數

在 `.env.local` 設定下列值；此檔案不得提交至 Git。

```env
# 瀏覽器端可使用的 Supabase 連線資訊
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_YOUR_KEY"

# 管理頁入口密碼；請在 GitHub Actions Secret 設定相同的值
VITE_ADMIN_PASSWORD="請使用長且隨機的密碼"

# 本機照片瀏覽器（只有使用該功能時才需要）
PHOTO_BROWSER_HOST="0.0.0.0"
PHOTO_BROWSER_PORT="4174"
PHOTO_BROWSER_SQL_DRIVER="ODBC Driver 17 for SQL Server"
PHOTO_BROWSER_SQL_SERVER="localhost\\SQLEXPRESS"
PHOTO_BROWSER_SQL_DATABASE="sanyi_檢視用"
PHOTO_BROWSER_SQL_ENCRYPT="No"
```

`VITE_*` 變數會寫入瀏覽器端程式，因此只能放公開連線資訊與前端設定，絕不可放 Supabase `service_role` key、Google Apps Script 密鑰或其他私密憑證。

## Supabase 初始化

1. 在 Supabase Dashboard 的 SQL Editor 執行 [`supabase/schema.sql`](supabase/schema.sql)。
2. 在專案設定取得 Project URL 與 publishable key，填入 `.env.local`。
3. 部署照片簽章上傳 Function：

   ```bash
   supabase functions deploy case-photo-upload-url
   ```

4. 如需由前端執行資料庫備份，再部署：

   ```bash
   supabase functions deploy database-sheet-backup
   ```

5. 從既有 Google Sheet 匯入路燈與維修資料時執行：

   ```bash
   npm run migrate:supabase
   ```

匯入工具會讀取 `.env.local` 的 Supabase 設定，並使用 `src/constants.ts` 中指定的 Google Sheet。請先備份正式資料，再於需要時執行。

### 照片同步至 Google Drive（選用）

完整設定請見 [`supabase/photo-drive-sync.md`](supabase/photo-drive-sync.md)。摘要如下：

1. 將 [`scripts/photo-drive-gas.js`](scripts/photo-drive-gas.js) 部署為 Google Apps Script Web App。
2. 在 Supabase Edge Function Secrets 設定 GAS 網址、上傳密鑰與排程密鑰。
3. 部署 `photo-drive-sync` Function，並依 `supabase/photo-drive-sync-cron.sql.example` 建立每分鐘重試排程。
4. 視需要在 SQL Editor 執行 [`supabase/enable-immediate-photo-drive-sync.sql`](supabase/enable-immediate-photo-drive-sync.sql)，使上傳後立即觸發同步。

資料庫覆寫備份至 Google Sheet 的設定，請見 [`supabase/database-sheet-backup.md`](supabase/database-sheet-backup.md)。

## 本機 SQL Server 照片瀏覽器（選用）

這是獨立於 GitHub Pages 的本機服務，透過 Windows 整合驗證讀取 `sanyi_檢視用` SQL Server 資料庫。

```bash
npm run photos:server:sqlserver
```

啟動後開啟 `http://127.0.0.1:4174/streetlightcodex/#/photos`。資料庫未啟動時，網站仍會開啟，但資料 API 會顯示連線錯誤；請確認 SQL Server 執行個體、ODBC Driver 與 `.env.local` 的 `PHOTO_BROWSER_*` 設定。

## 常用指令

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 啟動 Vite 開發伺服器 |
| `npm run lint` | 執行 TypeScript 型別檢查 |
| `npm run build` | 建置 GitHub Pages 使用的靜態檔案至 `dist/` |
| `npm run preview` | 預覽建置結果 |
| `npm run clean` | 清除 `dist/` |
| `npm run migrate:supabase` | 從既有 Google Sheet 匯入資料到 Supabase |
| `npm run photos:server:sqlserver` | 啟動本機 SQL Server 照片瀏覽器 |

## 專案結構

```text
src/
  components/       地圖、通報、查修、基座調查、置換與管理畫面
  services/         Supabase 資料讀寫流程
  lib/supabase.ts   Supabase REST、Storage 與 Edge Function 封裝
public/data/        三義鄉村里 GeoJSON
supabase/
  schema.sql        資料表、Storage、RLS 與照片佇列設定
  functions/        照片簽章上傳、Drive 同步、Google Sheet 備份 Functions
scripts/            Google Sheet 匯入與 Google Apps Script 程式
server/             本機 SQL Server 照片瀏覽器 API
.github/workflows/  GitHub Pages 建置與部署流程
```

## 部署

推送到 `main` 分支後，GitHub Actions 會執行型別檢查、建置，並部署至 GitHub Pages。部署工作流程需要在 GitHub repository 的 **Settings → Secrets and variables → Actions** 設定：

```text
VITE_ADMIN_PASSWORD
```

部署時使用的 Supabase URL 與 publishable key 定義於 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。若更換 Supabase 專案，請同步更新工作流程與本機 `.env.local`。

## 安全性注意事項

- 目前 schema 為遷移相容性，部分匿名寫入策略是暫時措施；正式公開前應以 Supabase Auth 與角色型 RLS 政策取代。
- 前端密碼不是完整的身分驗證機制，不能用來保護高敏感性資料或管理操作。
- 請立即替換任何曾出現在原始碼、文件或部署紀錄中的密鑰，並改用 GitHub Secrets 或 Supabase Edge Function Secrets 管理。
- 提交前請確認 `.env.local`、私密金鑰、資料庫備份及個資照片未被加入 Git。

## 授權

本專案為三義鄉公所路燈業務使用。
