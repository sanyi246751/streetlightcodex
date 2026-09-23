# 照片轉送到 Google Drive（Supabase + GAS）

照片先進入 Supabase Storage，Storage trigger 建立工作；每分鐘 Cron 呼叫 Edge Function。Function 建立 10 分鐘有效的下載網址並呼叫 GAS Web App；GAS 以部署者的 Google Drive 權限建立檔案。

成功順序：上傳 Drive → 記錄 Drive 檔案 ID → 刪除 Supabase 暫存檔 → 回寫資料列的 Drive URL。失敗保留暫存檔並於下一分鐘重試；若 Drive 已成功但暫存刪除失敗，後續只重試刪除，不建立重複 Drive 檔案。

## 設定

1. 在 Supabase SQL Editor 執行 `supabase/schema.sql`。
2. 建立 Google Apps Script，貼上 `scripts/photo-drive-gas.js`，把 `UPLOAD_SECRET` 改成長隨機字串。
3. 部署為 Web app：Execute as 選 **Me**，Who has access 選 **Anyone**。授權 DriveApp 與 UrlFetchApp，複製 `/exec` 網址。
4. 在 Supabase Edge Function Secrets 設定：

```text
GAS_PHOTO_UPLOAD_URL=<GAS Web App /exec URL>
GAS_PHOTO_UPLOAD_SECRET=<與 GAS 的 UPLOAD_SECRET 相同>
PHOTO_SYNC_CRON_SECRET=<另一個長隨機字串>
```

GAS 已使用你提供的資料夾：基座調查 `1drZ7J-9yuE2tGqh34iPSzwx04c2xfK-x`、置換更新 `1IIIU2Q7fcbIlCP4-wsNd7hQ5GcwzhjkM`、維修通報 `1oDuIfD-zC-6GsbOLAv_BUCqyw4Kw01Xp`。

5. 部署：`supabase functions deploy photo-drive-sync`。
6. 將 `supabase/photo-drive-sync-cron.sql.example` 的專案 URL 與相同的 `PHOTO_SYNC_CRON_SECRET` 代入後，在 SQL Editor 執行。

不要將任何 secret 放進 `.env.local` 或 Git。GAS 雖設定為 Anyone，但沒有正確 secret 的請求無法建立檔案。
