# CLAUDE.md — Agent 操作手冊

這是一個以 JSON 為資料庫的類 Trello 任務管理工具,透過 `node bin/pm.js` 操作。零依賴、無 build step。

## 鐵則

1. **一律用 CLI 改資料**,不要手改 `data/tasks.json`。CLI 做不到的情況才手改,改完必跑 `node bin/pm.js list` 驗證(載入時會做 schema 驗證)。
2. **任何資料變更後執行 `node bin/pm.js board`**,並把 `data/tasks.json` + `board.html` 一起 commit。
3. **不要手改 `board.html`** — 它是產物,會被覆蓋。
4. **不要手動設定任何 `lastNotified` 欄位** — 那是通知系統的冪等記錄,只由 `pm due --mark`(CI)寫入。
5. 日期一律 `YYYY-MM-DD`(台北時區);stage 只有 `plan / in_dev / in_test / done`(CLI 接受別名 `dev`、`test`)。

## 指令對照表(使用情境 → 指令)

| 使用者說 | 指令 |
|---|---|
| 列出進行中的任務 | `node bin/pm.js list` |
| T1 的細節 / milestone / 進度 | `node bin/pm.js show T1` |
| 開一個新專案任務 | `node bin/pm.js add "標題" --desc "說明" --owner capo` |
| 幫 T1 加一個步驟 | `node bin/pm.js step add T1 "步驟標題" --owner amy` |
| 把切版移到測試 | `node bin/pm.js move T1-S3 test` |
| 這個任務/步驟給 ben 負責 | `node bin/pm.js assign T1 ben` / `assign T1-S2 ben` |
| 設 8/15 的 milestone | `node bin/pm.js milestone add T1 "MVP 上線" --due 2026-08-15` |
| milestone 完成了 | `node bin/pm.js milestone done T1 "MVP 上線"` |
| 8/1 提醒我確認進度(checkpoint) | `node bin/pm.js checkpoint add T1 2026-08-01 --note "確認 MVP 進度"` |
| 每週一追一次 T1 進度 | `node bin/pm.js notify set T1 weekly --weekday mon` |
| 每天追 / 不用追了 | `node bin/pm.js notify set T2 daily` / `notify set T2 off` |
| 任務結案 / 封存 | `node bin/pm.js task done T1` / `task archive T1` |
| 給我一份進度報告 | `node bin/pm.js report` |
| 更新看板 | `node bin/pm.js board` |

機器可讀輸出:`list`、`show`、`due` 都支援 `--json`。

## 資料結構速查(data/tasks.json)

```json
{ "version": 1, "tasks": [ {
  "id": "T1", "title": "…", "description": "…", "owner": "capo",
  "status": "active",                  // active | done | archived
  "milestones": [ { "name": "…", "due": "YYYY-MM-DD", "done": false, "doneAt": null } ],
  "steps":      [ { "id": "T1-S1", "title": "…", "stage": "plan", "owner": "…" } ],
  "checkpoints":[ { "date": "YYYY-MM-DD", "note": "…", "lastNotified": null } ],
  "notify":     { "cadence": "weekly", "weekday": "mon", "lastNotified": null }
} ] }
```

ID 由資料推導(最大序號 +1),不要自己編號 — 用 CLI 建立就對了。

## 通知機制

- `.github/workflows/notify.yml` 每日 09:17(台北)在**預設分支**上執行 `pm due --json`:
  - **checkpoint** 在 `date <= 今天` 且 `lastNotified` 為空時觸發(只發一次,漏跑的日子會補發);
  - **notify** 依 cadence(daily / weekly+weekday)觸發,同一天不重發。
- 有觸發項時,workflow 在標題「進度追蹤」(label `pm-notify`)的 issue 留言彙整,然後 `pm due --mark` 寫回 `lastNotified` 並 commit。
- 留言含 `<!-- pm-notify:日期 -->` marker 做去重;可用 workflow_dispatch 手動測試。

## 測試

```bash
npm test                                        # node --test,零依賴
node bin/pm.js due --date 2026-08-03 --json    # 模擬任意日期的 CI 判定
node bin/pm.js due --mark --date 2026-08-03    # 模擬寫回(注意:會真的改資料檔)
node bin/pm.js <cmd> --file /tmp/t.json        # 用暫存資料檔做實驗,不動真資料
```
