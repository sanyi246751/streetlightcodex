# LINE 路燈故障通報通知

送出一筆路燈故障通報後，前端會呼叫 `line-fault-notification` Edge Function。該函式會從資料庫讀取已建立的通報與路燈座標，然後傳送 LINE Flex Message 到維修群組。

## 部署設定

在已登入且連結此 Supabase 專案的環境中設定下列 Secrets。請勿將 token 寫入 `.env`、前端程式或 Git。

```powershell
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN='（LINE Messaging API Channel access token）'
supabase secrets set LINE_GROUP_ID='（目標 LINE 群組 ID）'
supabase functions deploy line-fault-notification
```

Bot 必須先加入目標群組，並具備 Messaging API 的推播權限。部署後，送出通報仍會先成功儲存；若 LINE 暫時失敗，不會因此遺失通報。
