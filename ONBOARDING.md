# task-manager 共同維護指南(給協作 agent)

你被邀請進來一起維護 `u0401006/task-manager`——一個以 JSON 為資料庫的類 Trello 任務管理工具。這份文件是給**其他人的 Claude Code agent**(同事的 agent、其他機器上的 agent)看的,教你怎麼安全地更新自己負責的任務進度,而不會跟其他人同時在改的內容打架。

## 0. 前置條件(人類要先做的事)

這是 **private repo**。在你的 agent 能存取之前,repo owner(capo / u0401006)需要先在 GitHub 把你的帳號加成 collaborator(Settings → Collaborators)。這件事 agent 做不到,是人要手動點的一步——如果 `add_repo` 失敗說沒有權限,先回頭跟 capo 確認這步驟有沒有做。

## 1. 這個 repo 是什麼

- `bin/pm.js`:CLI,唯一該用來改資料的方式
- `data/tasks.json`:資料庫,git 追蹤
- `board.html`:看板,`pm board` 產生的**產物**,不要手改
- `CLAUDE.md`:完整操作手冊與指令對照表——**開始前一定要先讀這份**,這裡只講多人協作額外要注意的規則
- `.github/workflows/notify.yml`:每日排程,把到期的 checkpoint/追蹤留言到「進度追蹤」issue,跟你手動的更新無關,不用管它

## 2. 找到你要更新的任務

```bash
node bin/pm.js list --all --json | node -e "
  const tasks = JSON.parse(require('fs').readFileSync(0,'utf8'));
  console.log(tasks.filter(t => t.owner === '你的名字' /* 例如 karen、chiatzu */));
"
```

或直接 `node bin/pm.js show T5` 看單一任務細節。**只更新 owner 是你自己的任務/步驟**——如果需要改別人負責的東西(重新指派、改動別人的 step),先用一句話問過那個人或 capo,不要自己直接動。

## 3. 每次開始前:一定要先同步到最新

多個 agent 會同時改同一份 `data/tasks.json`,這是目前最容易衝突的地方。所以**每次開始前**:

```bash
git fetch origin main --quiet
git checkout -B <你的分支名> origin/main   # 從最新 main 重開分支,不要延續舊分支
```

不要延用一條開了很久沒 merge 的分支——資料檔案落後太多天,合併時衝突會很難處理。

## 4. 用 CLI 更新,不要手改 JSON

跟 `CLAUDE.md` 講的一樣,一律用 `node bin/pm.js <command>`。常用的:

```bash
node bin/pm.js move T5-S2 in_test          # 移動步驟階段
node bin/pm.js assign T5-S2 karen          # 指派(只指派給你自己或經確認的人)
node bin/pm.js milestone done T5 "MVP 上線"
node bin/pm.js checkpoint add T5 2026-08-01 --note "..."
node bin/pm.js task done T5                # 任務結案
```

**不要**:
- 手改 `data/tasks.json`(除非 CLI 真的做不到,改完務必 `node bin/pm.js list` 驗證 schema)
- 手改 `board.html`(產物,會被覆蓋)
- 手動改任何 `lastNotified` 欄位(通知系統的冪等記錄,只有 CI 的 `pm due --mark` 能寫)
- 更動不是你負責的任務/步驟,除非已經問過

## 5. 提交前檢查

```bash
node bin/pm.js board     # 資料變了就要重跑,看板才會同步
npm test                 # 16 個測試都要過
```

## 6. 提交方式:分支 + PR,不要直接推 main

```bash
git add data/tasks.json board.html
git commit -m "<清楚描述改了什麼、為什麼>"
git push -u origin <你的分支名>
```

然後開 PR 進 `main`。**優先自己 merge 沒問題的小更新**(例如自己任務的進度更新);如果變更範圍比較大、或動到別人東西、或你不確定,開 PR 後留言請 capo review 再合併,不要自己硬 merge。

合併前**再 fetch 一次 origin/main 確認沒有新的衝突**——如果同時間有別人也在改 `data/tasks.json`,PR 可能會有 merge conflict,需要重新 rebase 分支再處理過。

## 7. 一次只做一件事,盡快合併

不要把一堆不相關的任務更新塞在同一個分支裡累積好幾天才合併——這樣衝突機率最高。理想節奏是:**一次同步、一次更新、跑測試、開 PR、儘快合併**,下次再重新從最新 main 開始。

## 8. 有疑問怎麼辦

- 不確定某個任務該不該關閉、該不該重新指派 → 問 capo,不要自己猜
- 想新增一個全新的任務(不在現有清單裡)→ 可以直接 `pm add`,但描述寫清楚背景,方便其他人看得懂
- 這份文件沒提到的情境 → 先讀 `CLAUDE.md`,還是不確定就問人
