'use strict';
// Data layer for data/tasks.json: load/save/validate, ID generation, constants.

const fs = require('fs');
const path = require('path');

const STAGES = ['plan', 'in_dev', 'in_test', 'done'];
const STAGE_ALIASES = {
  plan: 'plan',
  dev: 'in_dev',
  in_dev: 'in_dev',
  indev: 'in_dev',
  test: 'in_test',
  in_test: 'in_test',
  intest: 'in_test',
  done: 'done',
};
const STAGE_LABELS = { plan: 'Plan', in_dev: 'In Dev', in_test: 'In Test', done: 'Done' };
const STATUSES = ['active', 'done', 'archived'];
const CADENCES = ['daily', 'weekly', 'off'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function repoRoot() {
  return path.resolve(__dirname, '..');
}

function defaultFile() {
  return path.join(repoRoot(), 'data', 'tasks.json');
}

function isDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Calendar date "today" in Asia/Taipei regardless of the runner's timezone.
function todayTaipei(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(now || new Date());
}

// Weekday of a plain calendar date (timezone-independent for date-only strings).
function weekdayOf(dateStr) {
  return WEEKDAYS[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeStage(s) {
  return STAGE_ALIASES[String(s || '').toLowerCase()] || null;
}

function validate(data, file) {
  const fail = (msg) => {
    throw new Error(`Invalid data in ${file}: ${msg}`);
  };
  if (!data || typeof data !== 'object' || !Array.isArray(data.tasks)) fail('missing "tasks" array');
  const taskIds = new Set();
  for (const t of data.tasks) {
    if (!t.id || !/^T\d+$/.test(t.id)) fail(`task id "${t.id}" must match T<number>`);
    if (taskIds.has(t.id)) fail(`duplicate task id ${t.id}`);
    taskIds.add(t.id);
    if (!t.title) fail(`task ${t.id} has no title`);
    if (!STATUSES.includes(t.status)) fail(`task ${t.id} has unknown status "${t.status}"`);
    const stepIds = new Set();
    for (const s of t.steps || []) {
      if (!s.id || !s.id.startsWith(t.id + '-S')) fail(`step id "${s.id}" must match ${t.id}-S<number>`);
      if (stepIds.has(s.id)) fail(`duplicate step id ${s.id}`);
      stepIds.add(s.id);
      if (!STAGES.includes(s.stage)) fail(`step ${s.id} has unknown stage "${s.stage}"`);
    }
    for (const m of t.milestones || []) {
      if (!m.name) fail(`task ${t.id} has a milestone without a name`);
      if (!isDateStr(m.due)) fail(`milestone "${m.name}" in ${t.id} has bad due date "${m.due}" (want YYYY-MM-DD)`);
    }
    for (const c of t.checkpoints || []) {
      if (!isDateStr(c.date)) fail(`checkpoint in ${t.id} has bad date "${c.date}" (want YYYY-MM-DD)`);
    }
    if (t.notify) {
      if (!CADENCES.includes(t.notify.cadence)) fail(`task ${t.id} has unknown notify cadence "${t.notify.cadence}"`);
      if (t.notify.cadence === 'weekly' && !WEEKDAYS.includes(t.notify.weekday)) {
        fail(`task ${t.id} weekly notify needs weekday (mon..sun), got "${t.notify.weekday}"`);
      }
    }
  }
  return data;
}

function load(file) {
  const f = file || defaultFile();
  if (!fs.existsSync(f)) return { version: 1, tasks: [] };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot parse ${f}: ${e.message}`);
  }
  return validate(data, f);
}

function save(file, data) {
  const f = file || defaultFile();
  validate(data, f);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}

// IDs are derived from existing data, not stored counters, so manual edits
// and merges never collide.
function nextTaskId(data) {
  let max = 0;
  for (const t of data.tasks) {
    const n = Number(t.id.slice(1));
    if (n > max) max = n;
  }
  return 'T' + (max + 1);
}

function nextStepId(task) {
  let max = 0;
  for (const s of task.steps || []) {
    const n = Number(s.id.slice(task.id.length + 2));
    if (n > max) max = n;
  }
  return `${task.id}-S${max + 1}`;
}

function findTask(data, id) {
  return data.tasks.find((t) => t.id === id) || null;
}

function findStep(data, stepId) {
  const taskId = String(stepId).split('-')[0];
  const task = findTask(data, taskId);
  if (!task) return null;
  const step = (task.steps || []).find((s) => s.id === stepId);
  return step ? { task, step } : null;
}

module.exports = {
  STAGES,
  STAGE_LABELS,
  STATUSES,
  CADENCES,
  WEEKDAYS,
  repoRoot,
  defaultFile,
  isDateStr,
  todayTaipei,
  weekdayOf,
  nowIso,
  normalizeStage,
  load,
  save,
  validate,
  nextTaskId,
  nextStepId,
  findTask,
  findStep,
};
