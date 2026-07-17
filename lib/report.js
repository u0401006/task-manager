'use strict';
// Markdown progress report; also used as the notification comment body in CI.

const { STAGES, STAGE_LABELS } = require('./store');

function stageCounts(task) {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const s of task.steps || []) counts[s.stage]++;
  return counts;
}

function report(data, today, opts) {
  const only = opts && opts.taskIds ? new Set(opts.taskIds) : null;
  const tasks = data.tasks.filter((t) => t.status === 'active' && (!only || only.has(t.id)));
  const lines = [`# 進度報告 (${today})`, ''];
  if (tasks.length === 0) {
    lines.push('目前沒有進行中的任務。');
    return lines.join('\n') + '\n';
  }
  for (const t of tasks) {
    lines.push(`## ${t.id} ${t.title}`);
    lines.push('');
    lines.push(`- 負責人:${t.owner || '(未指派)'}`);
    const counts = stageCounts(t);
    const total = (t.steps || []).length;
    const parts = STAGES.map((s) => `${STAGE_LABELS[s]} ${counts[s]}`).join(' / ');
    lines.push(`- 步驟:${counts.done}/${total} 完成(${parts})`);
    for (const m of t.milestones || []) {
      const overdue = !m.done && m.due < today;
      const flag = m.done ? '✅' : overdue ? `🔴 逾期(原定 ${m.due})` : `⏳ ${m.due} 前`;
      lines.push(`- Milestone「${m.name}」:${flag}`);
    }
    const pending = (t.checkpoints || []).filter((c) => !c.lastNotified);
    for (const c of pending) {
      const when = c.date < today ? `🔴 已到期 ${c.date}` : c.date === today ? `⏰ 今天` : `📅 ${c.date}`;
      lines.push(`- Checkpoint:${when}${c.note ? ` — ${c.note}` : ''}`);
    }
    if (t.notify && t.notify.cadence !== 'off') {
      const label = t.notify.cadence === 'daily' ? '每日' : `每週(${t.notify.weekday})`;
      lines.push(`- 追蹤頻率:${label}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

module.exports = { report, stageCounts };
