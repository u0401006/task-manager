'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PM = path.join(__dirname, '..', 'bin', 'pm.js');

function makeTmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-test-'));
  return path.join(dir, 'tasks.json');
}

function pm(file, args, opts) {
  return execFileSync('node', [PM, ...args, '--file', file], { encoding: 'utf8', ...opts });
}

test('end-to-end: add / step / move / milestone / checkpoint / notify / due --mark', () => {
  const file = makeTmpFile();

  const out = pm(file, ['add', '網站改版', '--owner', 'capo', '--desc', '測試']);
  assert.match(out, /T1/);

  pm(file, ['step', 'add', 'T1', '切版', '--owner', 'amy']);
  pm(file, ['move', 'T1-S1', 'dev']);
  let data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.tasks[0].steps[0].stage, 'in_dev');

  pm(file, ['milestone', 'add', 'T1', 'MVP', '--due', '2026-08-15']);
  pm(file, ['milestone', 'done', 'T1', 'MVP']);
  pm(file, ['checkpoint', 'add', 'T1', '2026-08-01', '--note', 'check']);
  pm(file, ['notify', 'set', 'T1', 'weekly', '--weekday', 'mon']);
  pm(file, ['assign', 'T1-S1', 'ben']);
  data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.tasks[0].milestones[0].done, true);
  assert.equal(data.tasks[0].steps[0].owner, 'ben');
  assert.equal(data.tasks[0].notify.weekday, 'mon');

  // 2026-08-03 is a Monday and past the checkpoint: both fire.
  const dueOut = JSON.parse(pm(file, ['due', '--date', '2026-08-03', '--json']));
  assert.equal(dueOut.items.length, 2);

  pm(file, ['due', '--mark', '--date', '2026-08-03']);
  const after = JSON.parse(pm(file, ['due', '--date', '2026-08-03', '--json']));
  assert.equal(after.items.length, 0);

  const list = JSON.parse(pm(file, ['list', '--json']));
  assert.equal(list.length, 1);
  pm(file, ['task', 'done', 'T1']);
  assert.equal(JSON.parse(pm(file, ['list', '--json'])).length, 0);
  assert.equal(JSON.parse(pm(file, ['list', '--all', '--json'])).length, 1);
});

test('invalid stage and unknown ids exit 1', () => {
  const file = makeTmpFile();
  pm(file, ['add', 'x']);
  pm(file, ['step', 'add', 'T1', 's']);
  assert.throws(() => pm(file, ['move', 'T1-S1', 'review'], { stdio: 'pipe' }));
  assert.throws(() => pm(file, ['show', 'T99'], { stdio: 'pipe' }));
  assert.throws(() => pm(file, ['checkpoint', 'add', 'T1', '08-01'], { stdio: 'pipe' }));
});

test('board generation embeds data and pre-renders cards', () => {
  const file = makeTmpFile();
  pm(file, ['add', '看板任務', '--owner', 'capo']);
  pm(file, ['step', 'add', 'T1', '第一步</script>', '--stage', 'test']);
  const out = path.join(path.dirname(file), 'board.html');
  pm(file, ['board', '-o', out]);
  const html = fs.readFileSync(out, 'utf8');
  assert.match(html, /In Test/);
  assert.match(html, /看板任務/);
  assert.ok(!html.includes('第一步</script>'), 'script tag in titles must be escaped');
  assert.match(html, /id="pm-data"/);
});

test('report includes overdue milestone flag', () => {
  const file = makeTmpFile();
  pm(file, ['add', 'r']);
  pm(file, ['milestone', 'add', 'T1', 'm1', '--due', '2026-01-01']);
  const md = pm(file, ['report', '--date', '2026-07-17']);
  assert.match(md, /逾期/);
});
