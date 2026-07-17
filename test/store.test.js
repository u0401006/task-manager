'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const store = require('../lib/store');

test('nextTaskId derives from max existing suffix', () => {
  assert.equal(store.nextTaskId({ tasks: [] }), 'T1');
  assert.equal(store.nextTaskId({ tasks: [{ id: 'T1' }, { id: 'T7' }, { id: 'T3' }] }), 'T8');
});

test('nextStepId survives deletions (no reuse below max)', () => {
  const task = { id: 'T2', steps: [{ id: 'T2-S1' }, { id: 'T2-S5' }] };
  assert.equal(store.nextStepId(task), 'T2-S6');
});

test('normalizeStage accepts aliases and rejects unknowns', () => {
  assert.equal(store.normalizeStage('dev'), 'in_dev');
  assert.equal(store.normalizeStage('test'), 'in_test');
  assert.equal(store.normalizeStage('PLAN'), 'plan');
  assert.equal(store.normalizeStage('review'), null);
});

test('weekdayOf is timezone-independent for date strings', () => {
  assert.equal(store.weekdayOf('2026-07-20'), 'mon');
  assert.equal(store.weekdayOf('2026-07-17'), 'fri');
  assert.equal(store.weekdayOf('2026-07-19'), 'sun');
});

test('isDateStr validates real calendar dates', () => {
  assert.ok(store.isDateStr('2026-02-28'));
  assert.ok(!store.isDateStr('2026-02-30'));
  assert.ok(!store.isDateStr('2026-8-1'));
  assert.ok(!store.isDateStr('nope'));
});

test('validate rejects bad stage, duplicate ids, bad dates', () => {
  const base = () => ({
    version: 1,
    tasks: [{ id: 'T1', title: 'x', status: 'active', steps: [], milestones: [], checkpoints: [] }],
  });

  const badStage = base();
  badStage.tasks[0].steps = [{ id: 'T1-S1', title: 's', stage: 'wip' }];
  assert.throws(() => store.validate(badStage, 'mem'), /unknown stage/);

  const dupTask = base();
  dupTask.tasks.push({ id: 'T1', title: 'y', status: 'active', steps: [], milestones: [], checkpoints: [] });
  assert.throws(() => store.validate(dupTask, 'mem'), /duplicate task id/);

  const badDate = base();
  badDate.tasks[0].checkpoints = [{ date: '2026/08/01', note: '' }];
  assert.throws(() => store.validate(badDate, 'mem'), /bad date/);

  const badCadence = base();
  badCadence.tasks[0].notify = { cadence: 'monthly' };
  assert.throws(() => store.validate(badCadence, 'mem'), /cadence/);
});
