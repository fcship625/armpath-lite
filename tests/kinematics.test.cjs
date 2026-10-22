const { test } = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/kinematics.js');
const near = (a, b, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const settings = { l1: 140, l2: 100, branch: 1, speed: 60, step: 2 };

test('forward kinematics uses a relative elbow angle', () => {
  const p = K.forward(140, 100, Math.PI / 2, -Math.PI / 2);
  near(p.tip.x, 100); near(p.tip.y, 140);
});
test('both inverse branches round-trip across the reachable annulus', () => {
  for (const branch of [-1, 1]) for (let radius = 41; radius < 240; radius += 7) {
    for (let angle = -Math.PI; angle <= Math.PI; angle += 0.19) {
      const x = radius * Math.cos(angle), y = radius * Math.sin(angle);
      const p = K.inverse(140, 100, x, y, branch);
      assert.equal(p.reachable, true); near(p.tip.x, x); near(p.tip.y, y);
      assert.equal(Math.sign(p.q2), branch);
    }
  }
});
test('rejects unreachable targets and resolves exact boundaries', () => {
  assert.equal(K.inverse(140, 100, 241, 0).reason, 'outside');
  assert.equal(K.inverse(140, 100, 39, 0).reason, 'inside');
  for (const radius of [40, 240]) {
    const p = K.inverse(140, 100, radius, 0);
    assert.equal(p.singular, true); near(p.tip.x, radius); near(p.tip.y, 0);
  }
});
test('continuous inspection finds an inner-hole crossing missed by endpoints', () => {
  const a = { x: -120, y: 10 }, b = { x: 120, y: 10 };
  assert.ok(K.inverse(140, 100, a.x, a.y).reachable && K.inverse(140, 100, b.x, b.y).reachable);
  const p = K.plan({ ...settings, step: 1000, waypoints: [a, b] });
  assert.equal(p.valid, false); assert.equal(p.invalid[0].reason, 'inside');
  near(p.invalid[0].minRadius, 10); assert.equal(p.samples.length, 0);
  assert.throws(() => K.toCSV(p, settings));
});
test('tangent segment is reachable; degenerate segment has a defined minimum', () => {
  assert.equal(K.inspectSegment(140, 100, { x: -80, y: 40 }, { x: 80, y: 40 }).valid, true);
  const s = K.inspectSegment(140, 100, { x: 80, y: 40 }, { x: 80, y: 40 });
  near(s.length, 0); near(s.minRadius, Math.hypot(80, 40));
});
test('continuous singularity check catches a tangent between coarse samples', () => {
  const p = K.plan({ ...settings, step: 1000, waypoints: [{ x: -80, y: 40 }, { x: 80, y: 40 }] });
  assert.ok(p.valid); assert.equal(p.samples.length, 2);
  assert.ok(p.samples.every(s => s.index > .1)); near(p.minIndex, 0);
});
test('equal-link origin is nonunique and crossing it blocks path generation', () => {
  assert.equal(K.inverse(100, 100, 0, 0).ambiguous, true);
  const s = K.inspectSegment(100, 100, { x: -50, y: 0 }, { x: 50, y: 0 });
  assert.equal(s.reason, 'origin');
});
test('sampling preserves corners, endpoints, speed, FK and maximum spacing', () => {
  const w = [{ x: 100, y: 50 }, { x: 150, y: 50 }, { x: 150, y: 100 }];
  const p = K.plan({ ...settings, waypoints: w });
  assert.ok(p.valid); near(p.length, 100); near(p.duration, 100 / 60);
  assert.equal(p.samples.length, 51);
  assert.ok(p.samples.some(s => s.x === 150 && s.y === 50));
  for (let i = 0; i < p.samples.length; i++) {
    const s = p.samples[i], fk = K.forward(settings.l1, settings.l2, s.q1, s.q2);
    near(s.x, fk.tip.x); near(s.y, fk.tip.y);
    if (i) {
      const prev = p.samples[i - 1], d = Math.hypot(s.x - prev.x, s.y - prev.y);
      assert.ok(d <= 2 + 1e-8); near(s.t - prev.t, d / settings.speed);
    }
  }
  near(p.samples.at(-1).t, p.duration);
});
test('shoulder angles stay continuous across the atan2 branch cut', () => {
  const p = K.plan({ ...settings, waypoints: [{ x: -120, y: 30 }, { x: -120, y: -30 }] });
  assert.ok(p.valid);
  for (let i = 1; i < p.samples.length; i++) assert.ok(Math.abs(p.samples[i].q1 - p.samples[i - 1].q1) < 0.1);
});
test('coarse sampling preserves genuine shoulder turns greater than 180 degrees', () => {
  for (const branch of [1, -1]) {
    const options = { l1: 20, l2: 20, branch, speed: 60,
      waypoints: [{ x: -0.1, y: -branch * 0.01 }, { x: 19.8, y: -branch * 0.01 }] };
    const coarse = K.plan({ ...options, step: 20 });
    const fine = K.plan({ ...options, step: 0.01 });
    assert.ok(coarse.valid && fine.valid); assert.equal(coarse.samples.length, 2);
    assert.ok(Math.abs(fine.samples.at(-1).q1 - fine.samples[0].q1) > Math.PI);
    near(coarse.samples.at(-1).q1, fine.samples.at(-1).q1);
    const last = coarse.samples.at(-1), fk = K.forward(20, 20, last.q1, last.q2);
    near(last.x, fk.tip.x); near(last.y, fk.tip.y);
    const finalRow = K.toCSV(coarse, { ...options, step: 20 }).trim().split('\r\n').at(-1).split(',');
    near(Number(finalRow[3]), K.degrees(fine.samples.at(-1).q1), 1e-6);
  }
});
test('continuous shoulder angles retain three complete path windings', () => {
  for (const branch of [1, -1]) {
    const waypoints = Array.from({ length: 73 }, (_, i) => ({
      x: 120 * Math.cos(i * Math.PI / 12), y: 120 * Math.sin(i * Math.PI / 12)
    }));
    const p = K.plan({ ...settings, branch, step: 20, waypoints });
    assert.ok(p.valid);
    near(p.samples.at(-1).q1 - p.samples[0].q1, 6 * Math.PI);
  }
});
test('duplicate waypoints create no duplicate timestamps', () => {
  const p = K.plan({ ...settings, waypoints: [{ x: 100, y: 50 }, { x: 100, y: 50 }] });
  assert.ok(p.valid); assert.equal(p.samples.length, 1); near(p.duration, 0);
});
test('CSV includes units, configuration and all samples', () => {
  const p = K.plan({ ...settings, waypoints: [{ x: 100, y: 50 }, { x: 102, y: 50 }] });
  const rows = K.toCSV(p, settings).trim().split('\r\n');
  assert.equal(rows.length, p.samples.length + 1); assert.equal(rows[0].split(',').length, 10);
  assert.ok(rows[0].includes('q1_deg')); assert.equal(rows[1].split(',')[6], '140.000000');
});
test('validates finite inputs, branch, project files and sample budgets', () => {
  assert.throws(() => K.inverse(-1, 100, 0, 0));
  assert.throws(() => K.inverse(100, 100, NaN, 0));
  assert.throws(() => K.inverse(100, 100, 100, 0, 0));
  assert.throws(() => K.plan({ ...settings, speed: 0, waypoints: [] }));
  assert.throws(() => K.plan({ ...settings, step: 0.00001, waypoints: [{ x: 100, y: 50 }, { x: 150, y: 50 }] }));
  const config = { schemaVersion: 1, ...settings, target: { x: 100, y: 50 }, waypoints: [] };
  assert.deepEqual(K.validateProject(config), config);
  assert.throws(() => K.validateProject({ ...config, l1: Infinity }));
  assert.throws(() => K.validateProject({ ...config, l1: 140.5 }));
  assert.throws(() => K.validateProject({ ...config, waypoints: [{ x: '<script>', y: 0 }] }));
});
