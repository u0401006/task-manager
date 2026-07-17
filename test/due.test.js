'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluate, mark } = require('../lib/due');

function fixture() {
  return {
    version: 1,
    tasks: [
      {
        id: 'T1', title: 'A', status: 'active', steps: [], milestones: [],
        checkpoints: [{ date: '2026-08-01', note: 'check', lastNotified: null }],
        notify: { cadence: 'weekly', weekday: 'mon', lastNotified: null },
      },
      {
        id: 'T2', title: 'B', status: 'active', steps: [], milestones: [],
        checkpoints: [],
        notify: { cadence: 'daily', weekday: null, lastNotified: null },
      },
      {
        id: 'T3', title: 'C archived', status: 'archived', steps: [], milestones: [],
        checkpoints: [{ date: '2026-01-01', note: '', lastNotified: null }],
        notify: { cadence: 'daily', weekday: null, lastNotified: null },
      },
    ],
  };
}

test('checkpoint fires on its date and when overdue-and-unnotified', () => {
  const onDate = evaluate(fixture(), '2026-08-01').filter((i) => i.type === 'checkpoint');
  assert.equal(onDate.length, 1);
  assert.equal(onDate[0].overdue, false);

  const late = evaluate(fixture(), '2026-08-05').filter((i) => i.type === 'checkpoint');
  assert.equal(late.length, 1);
  assert.equal(late[0].overdue, true);

  const before = evaluate(fixture(), '2026-07-31').filter((i) => i.type === 'checkpoint');
  assert.equal(before.length, 0);
});

test('checkpoint fires only once (lastNotified set by mark)', () => {
  const data = fixture();
  mark(data, '2026-08-01');
  assert.equal(data.tasks[0].checkpoints[0].lastNotified, '2026-08-01');
  const again = evaluate(data, '2026-08-02').filter((i) => i.type === 'checkpoint');
  assert.equal(again.length, 0);
});

test('daily notify fires every day but not twice on the same day', () => {
  const data = fixture();
  const first = evaluate(data, '2026-07-17').filter((i) => i.taskId === 'T2');
  assert.equal(first.length, 1);
  mark(data, '2026-07-17');
  assert.equal(evaluate(data, '2026-07-17').filter((i) => i.taskId === 'T2').length, 0);
  assert.equal(evaluate(data, '2026-07-18').filter((i) => i.taskId === 'T2').length, 1);
});

test('weekly notify fires only on the configured weekday', () => {
  const data = fixture();
  // 2026-07-20 is a Monday, 2026-07-21 a Tuesday.
  const mon = evaluate(data, '2026-07-20').filter((i) => i.type === 'notify' && i.taskId === 'T1');
  assert.equal(mon.length, 1);
  const tue = evaluate(data, '2026-07-21').filter((i) => i.type === 'notify' && i.taskId === 'T1');
  assert.equal(tue.length, 0);
});

test('non-active tasks never fire', () => {
  const items = evaluate(fixture(), '2026-08-01').filter((i) => i.taskId === 'T3');
  assert.equal(items.length, 0);
});

test('cadence off fires nothing', () => {
  const data = fixture();
  data.tasks[1].notify = { cadence: 'off', weekday: null, lastNotified: null };
  assert.equal(evaluate(data, '2026-07-17').filter((i) => i.taskId === 'T2').length, 0);
});
