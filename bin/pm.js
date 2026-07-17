#!/usr/bin/env node
'use strict';
// pm — agent-operable Trello-like task manager CLI. Dispatch only; logic in lib/.

const path = require('path');
const fs = require('fs');
const store = require('../lib/store');
const due = require('../lib/due');
const { report } = require('../lib/report');
const board = require('../lib/board');

const FLAGS_WITH_VALUE = new Set(['--file', '--date', '--desc', '--owner', '--stage', '--due', '--note', '--weekday', '--tasks', '-o', '--out']);

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (FLAGS_WITH_VALUE.has(a)) {
      const key = a.replace(/^-+/, '');
      flags[key === 'o' ? 'out' : key] = argv[++i];
    } else if (a.startsWith('--')) {
      flags[a.slice(2)] = true;
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

function fail(msg) {
  console.error(`錯誤:${msg}`);
  process.exit(1);
}

function requireTask(data, id) {
  const t = store.findTask(data, id);
  if (!t) fail(`找不到任務 ${id}(用 pm list 查看)`);
  return t;
}

function requireDate(s, what) {
  if (!store.isDateStr(s)) fail(`${what} 需要 YYYY-MM-DD 格式的日期,收到 "${s}"`);
  return s;
}

function touch(obj) {
  obj.updatedAt = store.nowIso();
}

function saveAndHint(file, data, msg) {
  store.save(file, data);
  console.log(msg);
  console.log('(提醒:執行 node bin/pm.js board 更新看板)');
}

function nextCheckpoint(task) {
  return (task.checkpoints || [])
    .filter((c) => !c.lastNotified)
    .map((c) => c.date)
    .sort()[0] || '';
}

const HELP = `pm — 類 Trello 任務管理工具(zero-dependency)

用法:node bin/pm.js <指令> [參數] [--file <path>] [--date YYYY-MM-DD] [--json]

任務
  add "<標題>" [--desc "<說明>"] [--owner <人>]   建立任務
  list [--all] [--json]                          列出進行中任務(--all 含已完成/封存)
  show <T1> [--json]                             任務細節、milestone、步驟、checkpoint
  assign <T1|T1-S2> <人>                         指派任務或步驟負責人
  task done <T1> / task archive <T1>             結案 / 封存

步驟(stage: plan / in_dev / in_test / done,別名 dev、test)
  step add <T1> "<標題>" [--owner <人>] [--stage plan]
  move <T1-S2> <stage>                           移動步驟到指定階段

Milestone / Checkpoint / 追蹤
  milestone add <T1> "<名稱>" --due <日期>
  milestone done <T1> "<名稱>"
  checkpoint add <T1> <日期> [--note "<備註>"]
  notify set <T1> daily|off
  notify set <T1> weekly --weekday mon

排程與輸出
  due [--date D] [--json]                        列出當日應觸發的 checkpoint / 追蹤
  due --mark [--date D]                          觸發後寫回 lastNotified(CI 專用)
  board [-o board.html]                          重新產生靜態看板
  report [--date D] [--tasks T1,T2]              輸出 markdown 進度報告(--tasks 只列指定任務)
`;

function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const file = flags.file || store.defaultFile();
  const today = flags.date ? requireDate(flags.date, '--date') : store.todayTaipei();
  const cmd = pos[0];

  if (!cmd || cmd === 'help' || flags.help) {
    console.log(HELP);
    return;
  }

  const data = store.load(file);

  switch (cmd) {
    case 'add': {
      const title = pos[1];
      if (!title) fail('用法:pm add "<標題>" [--desc …] [--owner …]');
      const task = {
        id: store.nextTaskId(data),
        title,
        description: flags.desc || '',
        owner: flags.owner || '',
        status: 'active',
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
        milestones: [],
        steps: [],
        checkpoints: [],
        notify: { cadence: 'off', weekday: null, lastNotified: null },
      };
      data.tasks.push(task);
      saveAndHint(file, data, `已建立任務 ${task.id}:${title}`);
      break;
    }

    case 'list': {
      const tasks = data.tasks.filter((t) => flags.all || t.status === 'active');
      if (flags.json) {
        console.log(JSON.stringify(tasks, null, 2));
        break;
      }
      if (tasks.length === 0) {
        console.log('目前沒有進行中的任務。');
        break;
      }
      const rows = tasks.map((t) => {
        const total = (t.steps || []).length;
        const done = (t.steps || []).filter((s) => s.stage === 'done').length;
        return [t.id, t.title, t.owner || '-', `${done}/${total}`, nextCheckpoint(t) || '-', t.status];
      });
      const header = ['ID', '標題', '負責人', '步驟', '下個checkpoint', '狀態'];
      const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
      const fmt = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ');
      console.log(fmt(header));
      for (const r of rows) console.log(fmt(r));
      break;
    }

    case 'show': {
      const task = requireTask(data, pos[1]);
      if (flags.json) {
        console.log(JSON.stringify(task, null, 2));
        break;
      }
      console.log(`${task.id} ${task.title} [${task.status}]`);
      if (task.description) console.log(`說明:${task.description}`);
      console.log(`負責人:${task.owner || '(未指派)'}`);
      if ((task.milestones || []).length) {
        console.log('Milestones:');
        for (const m of task.milestones) {
          const flag = m.done ? '✅' : m.due < today ? `🔴 逾期(${m.due})` : `⏳ ${m.due}`;
          console.log(`  - ${m.name} ${flag}`);
        }
      }
      console.log('步驟:');
      for (const stage of store.STAGES) {
        const steps = (task.steps || []).filter((s) => s.stage === stage);
        if (!steps.length) continue;
        console.log(`  [${store.STAGE_LABELS[stage]}]`);
        for (const s of steps) console.log(`    ${s.id} ${s.title}${s.owner ? `(${s.owner})` : ''}`);
      }
      if (!(task.steps || []).length) console.log('  (尚無步驟)');
      for (const c of task.checkpoints || []) {
        const state = c.lastNotified ? `已通知 ${c.lastNotified}` : c.date < today ? '🔴 已到期' : '待通知';
        console.log(`Checkpoint ${c.date}${c.note ? `(${c.note})` : ''} — ${state}`);
      }
      if (task.notify && task.notify.cadence !== 'off') {
        console.log(`追蹤頻率:${task.notify.cadence === 'daily' ? '每日' : `每週 ${task.notify.weekday}`}`);
      }
      break;
    }

    case 'step': {
      if (pos[1] !== 'add') fail('用法:pm step add <T1> "<標題>" [--owner …] [--stage …]');
      const task = requireTask(data, pos[2]);
      const title = pos[3];
      if (!title) fail('步驟需要標題');
      const stage = flags.stage ? store.normalizeStage(flags.stage) : 'plan';
      if (!stage) fail(`未知的 stage "${flags.stage}"(可用:plan / in_dev / in_test / done)`);
      const step = {
        id: store.nextStepId(task),
        title,
        stage,
        owner: flags.owner || '',
        createdAt: store.nowIso(),
        updatedAt: store.nowIso(),
      };
      task.steps.push(step);
      touch(task);
      saveAndHint(file, data, `已新增步驟 ${step.id}:${title} [${stage}]`);
      break;
    }

    case 'move': {
      const found = store.findStep(data, pos[1]);
      if (!found) fail(`找不到步驟 ${pos[1]}`);
      const stage = store.normalizeStage(pos[2]);
      if (!stage) fail(`未知的 stage "${pos[2]}"(可用:plan / in_dev / in_test / done,別名 dev、test)`);
      found.step.stage = stage;
      touch(found.step);
      touch(found.task);
      saveAndHint(file, data, `${found.step.id}「${found.step.title}」→ ${store.STAGE_LABELS[stage]}`);
      break;
    }

    case 'assign': {
      const id = pos[1];
      const owner = pos[2];
      if (!id || !owner) fail('用法:pm assign <T1|T1-S2> <人>');
      if (/^T\d+$/.test(id)) {
        const task = requireTask(data, id);
        task.owner = owner;
        touch(task);
        saveAndHint(file, data, `任務 ${id} 負責人 → ${owner}`);
      } else {
        const found = store.findStep(data, id);
        if (!found) fail(`找不到步驟 ${id}`);
        found.step.owner = owner;
        touch(found.step);
        touch(found.task);
        saveAndHint(file, data, `步驟 ${id} 負責人 → ${owner}`);
      }
      break;
    }

    case 'milestone': {
      const sub = pos[1];
      const task = requireTask(data, pos[2]);
      const name = pos[3];
      if (!name) fail('用法:pm milestone add|done <T1> "<名稱>" [--due 日期]');
      if (sub === 'add') {
        const dueDate = requireDate(flags.due, '--due');
        task.milestones.push({ name, due: dueDate, done: false, doneAt: null });
        touch(task);
        saveAndHint(file, data, `已新增 milestone「${name}」(${dueDate})到 ${task.id}`);
      } else if (sub === 'done') {
        const m = (task.milestones || []).find((x) => x.name === name);
        if (!m) fail(`任務 ${task.id} 沒有名為「${name}」的 milestone`);
        m.done = true;
        m.doneAt = store.nowIso();
        touch(task);
        saveAndHint(file, data, `Milestone「${name}」已完成 ✅`);
      } else {
        fail('用法:pm milestone add|done <T1> "<名稱>"');
      }
      break;
    }

    case 'checkpoint': {
      if (pos[1] !== 'add') fail('用法:pm checkpoint add <T1> <日期> [--note …]');
      const task = requireTask(data, pos[2]);
      const date = requireDate(pos[3], 'checkpoint');
      task.checkpoints.push({ date, note: flags.note || '', lastNotified: null });
      touch(task);
      saveAndHint(file, data, `已設定 checkpoint ${date} 於 ${task.id}${flags.note ? `(${flags.note})` : ''}`);
      break;
    }

    case 'notify': {
      if (pos[1] !== 'set') fail('用法:pm notify set <T1> daily|weekly|off [--weekday mon]');
      const task = requireTask(data, pos[2]);
      const cadence = pos[3];
      if (!store.CADENCES.includes(cadence)) fail(`cadence 只能是 daily / weekly / off,收到 "${cadence}"`);
      const weekday = cadence === 'weekly' ? flags.weekday : null;
      if (cadence === 'weekly' && !store.WEEKDAYS.includes(weekday)) {
        fail('weekly 需要 --weekday mon|tue|wed|thu|fri|sat|sun');
      }
      task.notify = { cadence, weekday, lastNotified: (task.notify && task.notify.lastNotified) || null };
      touch(task);
      const label = cadence === 'off' ? '關閉' : cadence === 'daily' ? '每日' : `每週 ${weekday}`;
      saveAndHint(file, data, `任務 ${task.id} 追蹤頻率 → ${label}`);
      break;
    }

    case 'task': {
      const sub = pos[1];
      const task = requireTask(data, pos[2]);
      if (sub === 'done') task.status = 'done';
      else if (sub === 'archive') task.status = 'archived';
      else fail('用法:pm task done|archive <T1>');
      touch(task);
      saveAndHint(file, data, `任務 ${task.id} → ${task.status}`);
      break;
    }

    case 'due': {
      const items = flags.mark ? due.mark(data, today) : due.evaluate(data, today);
      if (flags.mark) store.save(file, data);
      if (flags.json) {
        console.log(JSON.stringify({ date: today, items }, null, 2));
        break;
      }
      if (!items.length) {
        console.log(`${today}:沒有需要觸發的項目。`);
        break;
      }
      for (const it of items) {
        if (it.type === 'checkpoint') {
          console.log(`⏰ [${it.taskId}] ${it.title} — checkpoint ${it.date}${it.overdue ? '(逾期)' : ''}${it.note ? `:${it.note}` : ''}`);
        } else {
          console.log(`📣 [${it.taskId}] ${it.title} — ${it.cadence === 'daily' ? '每日' : '每週'}追蹤`);
        }
      }
      if (flags.mark) console.log('(已寫回 lastNotified)');
      break;
    }

    case 'board': {
      const out = flags.out || path.join(store.repoRoot(), 'board.html');
      fs.writeFileSync(out, board.generate(data, today));
      console.log(`看板已更新:${out}`);
      break;
    }

    case 'report': {
      const only = flags.tasks ? String(flags.tasks).split(',') : null;
      process.stdout.write(report(data, today, only ? { taskIds: only } : undefined));
      break;
    }

    default:
      fail(`未知指令 "${cmd}"(pm help 查看用法)`);
  }
}

main();
