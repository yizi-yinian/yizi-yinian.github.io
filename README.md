# 一字一念

面向手機的線上佛經抄寫應用。目前完整收錄繁體《金剛般若波羅蜜經》三十二品與玄奘譯《般若波羅蜜多心經》，書寫字形與進度均在瀏覽器本地處理。

## 功能

- 首頁選經，支持從上次位置繼續
- Hanzi Writer 筆順引導、淡墨字形、筆順演示與重寫
- 手機端可選左手／右手模式，並可拖動、縮放田字格；書寫偏好會保存在本機
- 使用 `localStorage` 為每部經分別保存當前字、逐字完成狀態和累計用時
- 三十二品目錄、章節進度與任意章節跳轉
- 《金剛經》與《心經》經文直接取自 CBETA《大正新脩大藏經》T08 No.235、No.251 XML，不作簡繁轉換
- 固定經文摘要校驗，防止後續修改引入缺字、錯字或章節錯位
- 所需漢字字形隨網頁發佈，不依賴外部 CDN
- Hanzi Writer 未收錄的「鉢、諍、闇、罣」保留 CBETA 原字，使用淡墨字形自由描寫，不以近似字替換
- 手機優先，同時適配桌面

## 本地運行

需要 Node.js 22 或以上版本。

```bash
npm ci
npm run dev
```

## GitHub Pages

項目已包含 `.github/workflows/deploy-pages.yml`。推送到 GitHub 後：

1. 打開倉庫的 **Settings → Pages**。
2. 在 **Build and deployment** 中選擇 **GitHub Actions**。
3. 推送 `main` 分支，工作流會自動生成併發布靜態網頁。

本地檢查 GitHub Pages 靜態產物：

```bash
npm run build:github
```

輸出位於 `out/`。應用不需要數據庫、服務器或登錄服務。

## 校驗

```bash
npm run verify:sutra
npm test
```

經文校驗結果應為：《金剛經》三十二品、5,129 個正文漢字；《心經》一卷、260 個正文漢字。CBETA 來源版本及 SHA-256 摘要分別記錄在 `app/data/diamond-sutra.json` 和 `app/data/heart-sutra.json`。

字形數據來自 Hanzi Writer Data / Make Me a Hanzi，並遵循倉庫內 `public/hanzi-data/ARPHICPL.TXT` 所附許可。
