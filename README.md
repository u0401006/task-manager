# task-manager

類 Trello 的輕量專案管理工具,設計給 AI agent 與人共同操作:JSON 資料庫 + 零依賴 Node.js CLI + 靜態 HTML 看板 + GitHub Actions 自動追進度。

## 快速上手

```bash
node bin/pm.js add "官網改版" --desc "重新設計公司官網" --owner capo
node bin/pm.js step add T1 "首頁切版" --owner amy      # 步驟預設在 plan
node bin/pm.js move T1-S1 dev                          # plan → in_dev(別名 dev/test)
node bin/pm.js milestone add T1 "MVP 上線" --due 2026-08-15
node bin/pm.js checkpoint add T1 2026-08-01 --note "確認 MVP 進度"
node bin/pm.js notify set T1 weekly --weekday mon      # 每週一自動追進度
node bin/pm.js list                                    # 進行中任務總表
node bin/pm.js show T1                                 # 細節/milestone/步驟/checkpoint
node bin/pm.js report                                  # markdown 進度報告
node bin/pm.js board                                   # 產生 board.html(直接用瀏覽器開)
```

完整指令:`node bin/pm.js help`。Agent 操作規範見 [CLAUDE.md](CLAUDE.md)。

## 看板

`board.html` 是單一自包含檔案(file:// 直接開):Plan / In Dev / In Test / Done 四欄步驟卡片、負責人篩選、深淺色主題、milestone 與 checkpoint 逾期標示。資料變更後記得重跑 `node bin/pm.js board`。

## 自動追進度

`.github/workflows/notify.yml` 每天 09:17(台北)檢查:

- 到期(或逾期未通知)的 **checkpoint**
- 各任務設定的追蹤頻率(**daily / weekly**)

有項目時會在「進度追蹤」issue 留言彙整,並自動寫回通知記錄。也可在 Actions 頁面用 **Run workflow** 手動觸發。

## 測試

```bash
npm test
```
