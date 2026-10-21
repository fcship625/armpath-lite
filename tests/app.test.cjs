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
  await $('stage').emit('pointerup');
  assert.equal($('target-x').value, '120.0'); assert.equal($('target-y').value, '80.0');
  assert.equal($('add-point').disabled, false);
});
test('playback, scrubbing, pause and visibility changes work', async () => {
  const { $, frame, document } = launch();
  await $('play').emit('click'); frame(0); frame(1000);
  assert.equal($('play-time').textContent, '1.00 s');
  assert.equal($('play').textContent, 'Ⅱ 暂停回放');
  document.hidden = true; await document.emit('visibilitychange');
  assert.equal($('play').textContent, '▶ 回放轨迹');
  $('scrub').value = '1000'; await $('scrub').emit('input');
  assert.equal($('target-x').value, '100.0'); assert.equal($('target-y').value, '45.0');
  await $('play').emit('click'); frame(2000);
  assert.equal($('play-time').textContent, '0.00 s');
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
test('parameter changes replan and branch changes reverse the elbow angle', async () => {
  const { $ } = launch();
  $('branch').value = '-1'; await $('branch').emit('change');
  assert.match($('q2').textContent, /^-/);
  $('l1').value = '20'; $('l2').value = '20';
  await $('l1').emit('input'); await $('l2').emit('input');
  assert.equal($('export').disabled, true); assert.equal($('reach-badge').textContent, '目标不可达');
});
