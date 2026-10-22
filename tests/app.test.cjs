/* These tests exercise DOM event logic with local stubs, not browser layout. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const K = require('../src/kinematics.js');
const root = path.resolve(__dirname, '..');
function launch() {
  class Element {
    constructor() {
      this.value = ''; this.className = ''; this.textContent = ''; this.listeners = {};
      this.children = []; this.disabled = false; this.hidden = false; this.attrs = {};
      this.classList = { add: name => { this.className += ' ' + name; } };
    }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    async emit(name, data = {}) { for (const fn of this.listeners[name] || []) await fn({ target: this, ...data }); }
    setAttribute(key, value) { this.attrs[key] = value; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    remove() {}
    click() { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); else return this.emit('click'); }
    checkValidity() { return this.valid !== false; }
    reportValidity() { this.reported = true; }
    setPointerCapture() {}
    getScreenCTM() { return { inverse: () => ({}) }; }
  }
  const elements = new Map(), downloads = [], blobs = new Map(), frames = new Map();
  let frameId = 0;
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) elements.set(match[1], new Element());
  const document = new Element();
  Object.assign(document, { getElementById: id => elements.get(id), createElement: () => new Element(), createTextNode: text => ({ textContent: text }), body: new Element() });
  const context = { document, window: { ArmPath: K }, Blob,
    URL: { createObjectURL: blob => { const id = 'blob:' + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL() {} },
    DOMPoint: class { constructor(x, y) { this.x = x; this.y = y; } matrixTransform() { return this; } },
    setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: fn => { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame: id => frames.delete(id) };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8'), context, { filename: 'app.js' });
  return { $: id => elements.get(id), downloads, document,
    frame(time) { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(time)); } };
}

test('initial app plans the square and enables export', () => {
  const { $ } = launch();
  assert.equal($('point-count').textContent, 5);
  assert.equal($('sample-count').textContent, 141);
  assert.equal($('export').disabled, false);
  assert.match($('path-status').textContent, /整段路径几何可达/);
  assert.equal($('waypoints').children.length, 5);
  assert.match($('stage').innerHTML, /目标 X 145.0 mm/);
});
test('blind-zone demo blocks playback/export; circle restores them', async () => {
  const { $ } = launch();
  await $('hole-demo').emit('click');
  assert.match($('path-status').textContent, /内侧不可达盲区/);
  assert.equal($('play').disabled, true); assert.equal($('export').disabled, true);
  assert.equal($('reach-badge').textContent, '目标可达');
  await $('demo').emit('click');
  assert.equal($('point-count').textContent, 25);
  assert.equal($('export').disabled, false);
});
test('unreachable target cannot be appended; clear/add/undo update the route', async () => {
  const { $ } = launch();
  $('target-x').value = '500'; await $('target-x').emit('change');
  assert.equal($('reach-badge').textContent, '目标不可达'); assert.equal($('add-point').disabled, true);
  await $('add-point').emit('click'); assert.equal($('point-count').textContent, 5);
  await $('clear').emit('click'); assert.equal($('point-count').textContent, 0);
  assert.equal($('export').disabled, true);
  $('target-x').value = '100'; await $('target-x').emit('change');
  await $('add-point').emit('click'); assert.equal($('point-count').textContent, 1);
  await $('undo').emit('click'); assert.equal($('point-count').textContent, 0);
});
test('pointer target coordinates have +Y up and equivalent text controls', async () => {
  const { $ } = launch();
  await $('stage').emit('pointerdown', { button: 0, pointerId: 1, clientX: 120, clientY: -80 });
  await $('stage').emit('pointerup', { pointerId: 1 });
  assert.equal(Number($('target-x').value), 120); assert.equal(Number($('target-y').value), 80);
  assert.equal($('add-point').disabled, false);
});
test('a drag ignores other pointers and ends only for its own pointer', async () => {
  for (const endEvent of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const { $ } = launch(), stage = $('stage');
    const target = () => [Number($('target-x').value), Number($('target-y').value)];
    await stage.emit('pointerdown', { button: 0, pointerId: 1, clientX: 120, clientY: -80 });
    await stage.emit('pointerdown', { button: 0, pointerId: 2, clientX: 200, clientY: -10 });
    assert.deepEqual(target(), [120, 80], endEvent + ': extra contact');
    await stage.emit('pointermove', { pointerId: 2, clientX: 210, clientY: -20 });
    assert.deepEqual(target(), [120, 80], endEvent + ': unrelated move');
    await stage.emit(endEvent, { pointerId: 2 });
    await stage.emit('pointermove', { pointerId: 1, clientX: 130, clientY: -70 });
    assert.deepEqual(target(), [130, 70], endEvent + ': original drag continues');
    await stage.emit(endEvent, { pointerId: 1 });
    await stage.emit('pointermove', { pointerId: 1, clientX: 140, clientY: -60 });
    assert.deepEqual(target(), [130, 70], endEvent + ': drag has ended');
    await stage.emit('pointerdown', { button: 0, pointerId: 3, clientX: 150, clientY: -50 });
    assert.deepEqual(target(), [150, 50], endEvent + ': next drag starts');
  }
});
test('playback, scrubbing, pause and visibility changes work', async () => {
  const { $, frame, document } = launch();
  await $('play').emit('click'); frame(0); frame(1000);
  assert.equal($('play-time').textContent, '1.00 s');
  assert.equal($('play').textContent, 'Ⅱ 暂停回放');
  document.hidden = true; await document.emit('visibilitychange');
  assert.equal($('play').textContent, '▶ 回放轨迹');
  $('scrub').value = '1000'; await $('scrub').emit('input');
  assert.equal(Number($('target-x').value), 100); assert.equal(Number($('target-y').value), 45);
  await $('play').emit('click'); frame(2000);
  assert.equal($('play-time').textContent, '0.00 s');
});
test('focusing either target input pauses playback and preserves uncommitted typing', async () => {
  for (const axis of ['x', 'y']) {
    const { $, frame } = launch(), input = $('target-' + axis);
    await $('play').emit('click'); frame(0); frame(1000);
    const pose = $('stage').innerHTML;
    await input.emit('focus');
    assert.equal($('play').textContent, '▶ 回放轨迹');
    input.value = axis === 'x' ? '200' : '80';
    frame(1100);
    assert.equal(input.value, axis === 'x' ? '200' : '80');
    assert.equal($('play-time').textContent, '1.00 s');
    assert.equal($('stage').innerHTML, pose);
    await input.emit('change');
    assert.match($('stage').innerHTML, axis === 'x' ? /目标 X 200.0 mm/ : /Y 80.0 mm/);
  }
});
test('CSV and JSON downloads contain computed data and round-trip through import', async () => {
  const { $, downloads } = launch();
  await $('export').emit('click');
  assert.equal(downloads[0].name, 'armpath-trajectory.csv');
  assert.equal((await downloads[0].blob.text()).trim().split('\r\n').length, 142);
  await $('save-project').emit('click');
  const json = await downloads[1].blob.text(), config = K.validateProject(JSON.parse(json));
  assert.equal(config.waypoints.length, 5);
  await $('clear').emit('click');
  $('project-file').files = [{ size: json.length, text: async () => json }];
  await $('project-file').emit('change');
  assert.equal($('point-count').textContent, 5); assert.equal($('export').disabled, false);
});
test('malformed and oversized imports leave the existing project intact', async () => {
  const { $ } = launch();
  for (const file of [{ size: 2, text: async () => '{}' }, { size: 300000, text: async () => '' }]) {
    $('project-file').files = [file]; await $('project-file').emit('change');
    assert.equal($('point-count').textContent, 5); assert.match($('notice').textContent, /打开失败/);
  }
});
test('the most recently selected project wins when earlier reads finish late', async () => {
  const { $ } = launch();
  const base = JSON.parse(fs.readFileSync(path.join(root, 'examples/square.json'), 'utf8'));
  let finishOlder;
  const olderRead = new Promise(resolve => { finishOlder = resolve; });
  $('project-file').files = [{ size: 1000, text: () => olderRead }];
  const olderImport = $('project-file').emit('change');
  $('project-file').files = [{ size: 1000, text: async () => JSON.stringify({ ...base, l1: 160 }) }];
  await $('project-file').emit('change');
  assert.equal(Number($('l1').value), 160);
  finishOlder(JSON.stringify({ ...base, l1: 180 }));
  await olderImport;
  assert.equal(Number($('l1').value), 160);
  assert.equal($('notice').textContent, '工程已载入。');
});
test('an obsolete read failure cannot reset the newer input or replace its notice', async () => {
  const { $ } = launch();
  const base = JSON.parse(fs.readFileSync(path.join(root, 'examples/square.json'), 'utf8'));
  let failOlder, finishNewer;
  const olderRead = new Promise((resolve, reject) => { failOlder = reject; });
  const newerRead = new Promise(resolve => { finishNewer = resolve; });
  $('project-file').files = [{ size: 1000, text: () => olderRead }];
  const olderImport = $('project-file').emit('change');
  $('project-file').files = [{ size: 1000, text: () => newerRead }];
  $('project-file').value = 'newer-project.json';
  const newerImport = $('project-file').emit('change');
  failOlder(new Error('Obsolete read failed'));
  await olderImport;
  assert.equal($('project-file').value, 'newer-project.json');
  assert.doesNotMatch($('notice').textContent, /打开失败/);
  finishNewer(JSON.stringify({ ...base, l1: 160 }));
  await newerImport;
  assert.equal(Number($('l1').value), 160);
  assert.equal($('project-file').value, '');
  assert.equal($('notice').textContent, '工程已载入。');
});
test('precise imported targets survive numeric inputs, waypoint creation and saving', async () => {
  const { $, downloads } = launch();
  const project = JSON.parse(fs.readFileSync(path.join(root, 'examples/coarse-step.json'), 'utf8'));
  project.target = { x: -0.12345678901234567, y: -0.010000000000000002 };
  $('project-file').files = [{ size: 1000, text: async () => JSON.stringify(project) }];
  await $('project-file').emit('change');
  assert.equal(Number($('target-x').value), project.target.x);
  assert.equal(Number($('target-y').value), project.target.y);
  await $('add-point').emit('click');
  await $('save-project').emit('click');
  const saved = JSON.parse(await downloads[0].blob.text());
  assert.deepEqual(saved.target, project.target);
  assert.deepEqual(saved.waypoints.at(-1), project.target);
});
test('parameter changes replan and branch changes reverse the elbow angle', async () => {
  const { $ } = launch();
  $('branch').value = '-1'; await $('branch').emit('change');
  assert.match($('q2').textContent, /^-/);
  $('l1').value = '20'; $('l2').value = '20';
  await $('l1').emit('input'); await $('l2').emit('input');
  assert.equal($('export').disabled, true); assert.equal($('reach-badge').textContent, '目标不可达');
});
