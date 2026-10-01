# 資料庫備份至 Google Sheet

管理頁可將「路燈主檔、報修／查修、置換歷程、基座調查」完整覆寫備份到同一份 Google Sheet 中對應的工作表。

1. 建立或選擇備份用 Google Sheet，從網址取得試算表 ID。
2. 在該試算表的「擴充功能 → Apps Script」更新 `scripts/photo-drive-gas.js`，設定 `DATABASE_BACKUP_SECRET`；`BACKUP_SPREADSHEET_ID` 已設為此專案的備份試算表。
3. 重新部署該 Web app：Execute as 選 **Me**、Who has access 選 **Anyone**；複製最新的 `/exec` 網址。
4. 部署 Edge Function：`supabase functions deploy database-sheet-backup`。
5. 設定 Edge Function secrets：

```sh
supabase secrets set GAS_DATABASE_BACKUP_URL="https://script.google.com/macros/s/.../exec"
supabase secrets set GAS_DATABASE_BACKUP_SECRET="與 DATABASE_BACKUP_SECRET 相同的長隨機字串"
```

每次按下管理頁的「備份至 Google Sheet」會覆寫該資料表對應的工作表內容；其他工作表不受影響。
