'use strict';
// Generates a single self-contained board.html (all CSS/JS inline, cards
// pre-rendered in Node so the page works from file:// and without JS).

const { STAGES, STAGE_LABELS, todayTaipei } = require('./store');
const { stageCounts } = require('./report');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Deterministic hue from a name so each owner keeps a stable chip color.
function ownerHue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function ownerChip(owner) {
  if (!owner) return '<span class="chip chip-none">未指派</span>';
  return `<span class="chip" data-owner="${esc(owner)}" style="--hue:${ownerHue(owner)}">${esc(owner)}</span>`;
}

function stepCard(task, step, today) {
  return [
    `<article class="card${step.stage === 'done' ? ' card-done' : ''}" data-owner="${esc(step.owner || '')}" style="--hue:${ownerHue(task.id)}">`,
    `<div class="card-task">${esc(task.id)} ${esc(task.title)}</div>`,
    `<div class="card-title">${esc(step.title)}</div>`,
    `<div class="card-meta"><span class="step-id">${esc(step.id)}</span>${ownerChip(step.owner)}</div>`,
    '</article>',
  ].join('');
}

function taskRow(task, today) {
  const counts = stageCounts(task);
  const total = (task.steps || []).length;
  const pct = total ? Math.round((counts.done / total) * 100) : 0;
  const milestones = (task.milestones || [])
    .map((m) => {
      if (m.done) return `<span class="badge ok">✓ ${esc(m.name)}</span>`;
      if (m.due < today) return `<span class="badge overdue">${esc(m.name)} 逾期 ${daysBetween(m.due, today)} 天</span>`;
      return `<span class="badge">${esc(m.name)} · ${esc(m.due)}</span>`;
    })
    .join(' ');
  const nextCp = (task.checkpoints || []).filter((c) => !c.lastNotified).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  const cpBadge = nextCp
    ? nextCp.date < today
      ? `<span class="badge overdue">Checkpoint ${esc(nextCp.date)} 逾期 ${daysBetween(nextCp.date, today)} 天</span>`
      : `<span class="badge">Checkpoint ${esc(nextCp.date)}</span>`
    : '';
  const notify =
    task.notify && task.notify.cadence !== 'off'
      ? `<span class="badge notify">${task.notify.cadence === 'daily' ? '每日追蹤' : `每週追蹤 (${esc(task.notify.weekday)})`}</span>`
      : '';
  return [
    `<div class="task-row" data-owner="${esc(task.owner || '')}">`,
    `<div class="task-row-head"><strong>${esc(task.id)} ${esc(task.title)}</strong>${ownerChip(task.owner)}</div>`,
    task.description ? `<div class="task-desc">${esc(task.description)}</div>` : '',
    `<div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>`,
    `<div class="task-badges"><span class="badge">步驟 ${counts.done}/${total}</span> ${milestones} ${cpBadge} ${notify}</div>`,
    '</div>',
  ].join('');
}

function generate(data, todayOverride) {
  const today = todayOverride || todayTaipei();
  const tasks = data.tasks.filter((t) => t.status === 'active');
  const owners = [...new Set(tasks.flatMap((t) => [t.owner, ...(t.steps || []).map((s) => s.owner)]).filter(Boolean))];

  const columns = STAGES.map((stage) => {
    const cards = tasks
      .flatMap((t) => (t.steps || []).filter((s) => s.stage === stage).map((s) => stepCard(t, s, today)))
      .join('\n');
    const count = tasks.reduce((n, t) => n + (t.steps || []).filter((s) => s.stage === stage).length, 0);
    return `<section class="col" data-stage="${stage}"><h2>${STAGE_LABELS[stage]} <span class="count">${count}</span></h2><div class="col-cards">${cards}</div></section>`;
  }).join('\n');

  const summary = tasks.map((t) => taskRow(t, today)).join('\n');
  const filterChips = owners
    .map((o) => `<button class="chip filter" data-owner="${esc(o)}" style="--hue:${ownerHue(o)}">${esc(o)}</button>`)
    .join('');
  const json = JSON.stringify(data, null, 2).replace(/<\/script>/gi, '<\\/script>');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>任務看板</title>
<style>
:root {
  --bg: #f4f5f7; --col-bg: #ebecf0; --card-bg: #ffffff; --text: #172b4d;
  --muted: #5e6c84; --border: #dfe1e6; --accent: #0079bf; --overdue: #c0392b;
  --ok: #1e7d45; --shadow: 0 1px 2px rgba(9,30,66,.15);
}
:root[data-theme="dark"] {
  --bg: #1d2125; --col-bg: #161a1d; --card-bg: #22272b; --text: #b6c2cf;
  --muted: #8c9bab; --border: #363c43; --accent: #579dff; --overdue: #f87168;
  --ok: #4bce97; --shadow: 0 1px 2px rgba(0,0,0,.5);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1d2125; --col-bg: #161a1d; --card-bg: #22272b; --text: #b6c2cf;
    --muted: #8c9bab; --border: #363c43; --accent: #579dff; --overdue: #f87168;
    --ok: #4bce97; --shadow: 0 1px 2px rgba(0,0,0,.5);
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 14px/1.5 -apple-system, "Noto Sans TC", "Microsoft JhengHei", sans-serif; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 18px; }
header h1 { font-size: 18px; margin: 0 8px 0 0; }
.meta { color: var(--muted); font-size: 12px; }
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 0 18px 18px; }
@media (max-width: 900px) { .board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .board { grid-template-columns: 1fr; } }
.col { background: var(--col-bg); border-radius: 10px; padding: 10px; min-height: 120px; }
.col h2 { font-size: 13px; margin: 2px 4px 10px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.count { background: var(--border); border-radius: 10px; padding: 0 8px; font-size: 12px; }
.col-cards { display: flex; flex-direction: column; gap: 8px; }
.card { background: var(--card-bg); border-radius: 8px; padding: 8px 10px; box-shadow: var(--shadow);
  border-left: 4px solid hsl(var(--hue) 60% 55%); }
.card-done { opacity: .55; }
.card-task { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
.card-title { font-weight: 600; }
.card-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: 6px; }
.step-id { font-size: 11px; color: var(--muted); font-family: ui-monospace, monospace; }
.chip { display: inline-block; font-size: 11px; padding: 1px 8px; border-radius: 10px;
  background: hsl(var(--hue) 55% 88%); color: hsl(var(--hue) 60% 25%); border: none; }
:root[data-theme="dark"] .chip, :root:not([data-theme="light"]) .chip { background: hsl(var(--hue) 40% 26%); color: hsl(var(--hue) 60% 85%); }
@media (prefers-color-scheme: light) { :root:not([data-theme="dark"]) .chip { background: hsl(var(--hue) 55% 88%); color: hsl(var(--hue) 60% 25%); } }
.chip-none { background: var(--border); color: var(--muted); }
.filter { cursor: pointer; }
.filter.active { outline: 2px solid var(--accent); }
button.toggle { margin-left: auto; cursor: pointer; background: var(--card-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; }
.summary { padding: 0 18px 24px; }
.summary h2 { font-size: 15px; }
.task-row { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px;
  padding: 12px 14px; margin-bottom: 10px; box-shadow: var(--shadow); }
.task-row-head { display: flex; align-items: center; gap: 10px; }
.task-desc { color: var(--muted); font-size: 13px; margin-top: 4px; }
.progress { height: 6px; background: var(--border); border-radius: 3px; margin: 10px 0 8px; overflow: hidden; }
.progress-bar { height: 100%; background: var(--accent); }
.task-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 6px; background: var(--col-bg);
  border: 1px solid var(--border); color: var(--muted); }
.badge.overdue { background: var(--overdue); border-color: var(--overdue); color: #fff; }
.badge.ok { color: var(--ok); border-color: var(--ok); }
.badge.notify { color: var(--accent); border-color: var(--accent); }
.hidden { display: none !important; }
</style>
</head>
<body>
<header>
  <h1>任務看板</h1>
  <span class="meta">資料時間:${esc(today)}(台北)· 篩選:</span>
  ${filterChips || '<span class="meta">—</span>'}
  <button class="toggle" id="theme-toggle">🌓 主題</button>
</header>
<main class="board">
${columns}
</main>
<section class="summary">
<h2>任務總覽</h2>
${summary || '<p class="meta">目前沒有進行中的任務。</p>'}
</section>
<script type="application/json" id="pm-data">
${json}
</script>
<script>
(function () {
  var root = document.documentElement;
  var saved = localStorage.getItem('pm-theme');
  if (saved) root.setAttribute('data-theme', saved);
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') === 'dark' ||
      (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('pm-theme', next);
  });
  var active = null;
  document.querySelectorAll('.filter').forEach(function (btn) {
    btn.addEventListener('click', function () {
      active = active === btn.dataset.owner ? null : btn.dataset.owner;
      document.querySelectorAll('.filter').forEach(function (b) {
        b.classList.toggle('active', b.dataset.owner === active);
      });
      document.querySelectorAll('.card, .task-row').forEach(function (el) {
        el.classList.toggle('hidden', !!active && el.dataset.owner !== active);
      });
    });
  });
})();
</script>
</body>
</html>
`;
}

module.exports = { generate };
