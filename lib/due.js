'use strict';
// Pure evaluation of what fires on a given date: overdue/unfired checkpoints
// and per-task notify cadences. Date is injectable for tests and CI dry runs.

const { weekdayOf } = require('./store');

function evaluate(data, today) {
  const items = [];
  for (const task of data.tasks) {
    if (task.status !== 'active') continue;
    for (const cp of task.checkpoints || []) {
      // Fires once; a checkpoint missed on a skipped CI day still fires later.
      if (cp.date <= today && !cp.lastNotified) {
        items.push({
          type: 'checkpoint',
          taskId: task.id,
          title: task.title,
          date: cp.date,
          note: cp.note || '',
          overdue: cp.date < today,
        });
      }
    }
    const n = task.notify;
    if (!n || n.cadence === 'off' || n.lastNotified === today) continue;
    if (n.cadence === 'daily' || (n.cadence === 'weekly' && weekdayOf(today) === n.weekday)) {
      items.push({ type: 'notify', taskId: task.id, title: task.title, cadence: n.cadence });
    }
  }
  return items;
}

// Writes lastNotified for everything evaluate() says fires today. Mutates data.
function mark(data, today) {
  const items = evaluate(data, today);
  for (const item of items) {
    const task = data.tasks.find((t) => t.id === item.taskId);
    if (item.type === 'checkpoint') {
      const cp = task.checkpoints.find((c) => c.date === item.date && !c.lastNotified);
      if (cp) cp.lastNotified = today;
    } else {
      task.notify.lastNotified = today;
    }
  }
  return items;
}

module.exports = { evaluate, mark };
