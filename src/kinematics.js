/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 ArmPath Lite contributors
 * Pure geometry: millimetres, radians, +X right, +Y up; no hardware assumptions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ArmPath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TAU = 2 * Math.PI;
  const degrees = radians => radians * 180 / Math.PI;
  function geometry(l1, l2) {
    if (![l1, l2].every(v => Number.isFinite(v) && v > 0)) {
      throw new RangeError('两段臂长必须是有限正数。');
    }
    return { inner: Math.abs(l1 - l2), outer: l1 + l2, epsilon: (l1 + l2) * 1e-10 };
  }
  function point(p) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      throw new TypeError('坐标必须是有限数值。');
    }
  }
  function forward(l1, l2, q1, q2) {
    geometry(l1, l2);
    if (![q1, q2].every(Number.isFinite)) throw new TypeError('关节角必须是有限数值。');
    const elbow = { x: l1 * Math.cos(q1), y: l1 * Math.sin(q1) };
    return { elbow, tip: { x: elbow.x + l2 * Math.cos(q1 + q2), y: elbow.y + l2 * Math.sin(q1 + q2) } };
  }
  function inverse(l1, l2, x, y, branch = 1) {
    const g = geometry(l1, l2);
    point({ x, y });
    if (branch !== 1 && branch !== -1) throw new RangeError('分支必须为 +1 或 -1。');
    const radius = Math.hypot(x, y);
    if (radius < g.inner - g.epsilon || radius > g.outer + g.epsilon) {
      return { reachable: false, reason: radius < g.inner ? 'inside' : 'outside' };
    }
    const c2 = Math.max(-1, Math.min(1, (x * x + y * y - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
    const q2 = branch * Math.acos(c2);
    const ambiguous = radius <= g.epsilon && g.inner <= g.epsilon;
    const q1 = ambiguous ? 0 : Math.atan2(y, x) - Math.atan2(l2 * Math.sin(q2), l1 + l2 * Math.cos(q2));
    const index = Math.abs(Math.sin(q2));
    return { reachable: true, q1, q2, index, singular: index < 1e-7, ambiguous, ...forward(l1, l2, q1, q2) };
  }
  // The norm along a segment is convex. Its maximum is at an endpoint;
  // its minimum is the orthogonal projection of the origin, clamped to [0, 1].
  function inspectSegment(l1, l2, a, b) {
    const g = geometry(l1, l2);
    point(a); point(b);
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / (length * length)));
    const nearest = { x: a.x + t * dx, y: a.y + t * dy };
    const minRadius = Math.hypot(nearest.x, nearest.y);
    const maxRadius = Math.max(Math.hypot(a.x, a.y), Math.hypot(b.x, b.y));
    let reason = null;
    if (maxRadius > g.outer + g.epsilon) reason = 'outside';
    else if (minRadius < g.inner - g.epsilon) reason = 'inside';
    else if (g.inner <= g.epsilon && minRadius <= g.epsilon) reason = 'origin';
    return { valid: reason === null, reason, length, minRadius, maxRadius, nearest, t };
  }
  function unwrap(angle, previous) {
    return angle + TAU * Math.round((previous - angle) / TAU);
  }
  function plan({ l1, l2, branch = 1, speed = 60, step = 2, waypoints }) {
    geometry(l1, l2);
    if (branch !== 1 && branch !== -1) throw new RangeError('分支必须为 +1 或 -1。');
    if (![speed, step].every(v => Number.isFinite(v) && v > 0)) throw new RangeError('速度与采样步长必须是有限正数。');
    if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 200) {
      throw new RangeError('路径需要 2–200 个路点。');
    }
    waypoints.forEach(point);
    const segments = waypoints.slice(1).map((b, i) => ({ ...inspectSegment(l1, l2, waypoints[i], b), from: i, to: i + 1 }));
    const invalid = segments.filter(s => !s.valid);
    const length = segments.reduce((sum, s) => sum + s.length, 0);
    if (invalid.length) return { valid: false, segments, invalid, length, samples: [] };
    const estimated = 1 + segments.reduce((n, s) => n + (s.length === 0 ? 0 : Math.ceil(s.length / step)), 0);
    if (estimated > 50000) throw new RangeError('采样超过 50,000 点，请增大采样步长。');
    const samples = [];
    function append(p, distance) {
      const ik = inverse(l1, l2, p.x, p.y, branch);
      if (!ik.reachable || ik.ambiguous) throw new Error('路径包含无法稳定求解的点。');
      const q1 = samples.length ? unwrap(ik.q1, samples[samples.length - 1].q1) : ik.q1;
      samples.push({ t: distance / speed, x: p.x, y: p.y, q1, q2: ik.q2, index: ik.index });
    }
    append(waypoints[0], 0);
    let distance = 0;
    for (const segment of segments) {
      const a = waypoints[segment.from], b = waypoints[segment.to];
      const count = Math.ceil(segment.length / step);
      for (let j = 1; j <= count; j++) {
        const u = j / count;
        append({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, distance + u * segment.length);
      }
      distance += segment.length;
    }
    // Analytic extrema also catch tangency to a singular boundary between samples.
    const radialIndex = radius => {
      const c = Math.max(-1, Math.min(1, (radius * radius - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
      return Math.sqrt(Math.max(0, 1 - c * c));
    };
    const minIndex = segments.reduce((value, s) => Math.min(value, radialIndex(s.minRadius), radialIndex(s.maxRadius)), 1);
    return { valid: true, segments, invalid: [], length, duration: length / speed, samples, minIndex };
  }
  function toCSV(result, config) {
    if (!result.valid || !result.samples.length) throw new Error('只有通过检查的路径才能导出。');
    const rows = ['time_s,x_mm,y_mm,q1_deg,q2_deg,singularity_index,l1_mm,l2_mm,branch,speed_mm_s'];
    for (const s of result.samples) rows.push([s.t, s.x, s.y, degrees(s.q1), degrees(s.q2), s.index,
      config.l1, config.l2, config.branch, config.speed].map(v => Number(v).toFixed(6)).join(','));
    return rows.join('\r\n') + '\r\n';
  }
  function validateProject(value) {
    if (!value || value.schemaVersion !== 1) throw new Error('不支持的工程格式，需要 schemaVersion: 1。');
    const between = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
    if (![value.l1, value.l2].every(v => Number.isInteger(v) && between(v, 20, 300))) throw new Error('臂长必须为 20–300 mm 范围内的整数。');
    if (value.branch !== 1 && value.branch !== -1) throw new Error('分支必须为 +1 或 -1。');
    if (!between(value.speed, 1, 300) || !between(value.step, 0.5, 20)) throw new Error('速度范围为 1–300 mm/s，步长为 0.5–20 mm。');
    if (!Array.isArray(value.waypoints) || value.waypoints.length > 200) throw new Error('路点不能超过 200 个。');
    const clean = p => { point(p); if (![p.x, p.y].every(v => between(v, -650, 650))) throw new Error('坐标范围为 -650–650 mm。'); return { x: p.x, y: p.y }; };
    return { schemaVersion: 1, l1: value.l1, l2: value.l2, branch: value.branch, speed: value.speed,
      step: value.step, target: clean(value.target), waypoints: value.waypoints.map(clean) };
  }
  return { geometry, degrees, forward, inverse, inspectSegment, unwrap, plan, toCSV, validateProject };
});
