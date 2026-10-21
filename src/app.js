/* SPDX-License-Identifier: MIT; Copyright (c) 2026 ArmPath Lite contributors */
(function () {
  'use strict';
  const K = window.ArmPath, $ = id => document.getElementById(id);
  const initial = () => ({ schemaVersion: 1, l1: 140, l2: 100, branch: 1, speed: 60, step: 2,
    target: { x: 145, y: 95 }, waypoints: [{ x: 100, y: 45 }, { x: 170, y: 45 }, { x: 170, y: 115 }, { x: 100, y: 115 }, { x: 100, y: 45 }] });
  let state = initial(), result = null, playing = false, frame = 0, playbackTime = 0, previousFrame = null, dragging = false;
  let noticeTimer;
  const fmt = (v, n = 1) => Number(v).toFixed(n);
  const reasonText = { inside: '穿过内侧不可达盲区', outside: '超出最大可达半径', origin: '穿过等长机械臂的原点，逆解不唯一' };
  function notice(text) {
    $('notice').textContent = text; $('notice').hidden = false;
    clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { $('notice').hidden = true; }, 4500);
  }
  function stop() {
    playing = false; cancelAnimationFrame(frame); previousFrame = null;
    $('play').textContent = '▶ 回放轨迹';
  }
  function configToInputs() {
    for (const key of ['l1', 'l2', 'branch', 'speed', 'step']) $(key).value = state[key];
    targetToInputs();
  }
  function targetToInputs() {
    $('target-x').value = fmt(state.target.x); $('target-y').value = fmt(state.target.y);
  }
  function draw() {
    const { l1, l2, target, waypoints } = state, outer = l1 + l2, inner = Math.abs(l1 - l2);
    const extent = outer * 1.24, unit = extent / 300;
    const ik = K.inverse(l1, l2, target.x, target.y, state.branch);
    $('stage').setAttribute('viewBox', `${-extent} ${-extent} ${extent * 2} ${extent * 2}`);
    const lines = [], labels = [], grid = outer > 350 ? 100 : outer < 100 ? 20 : 50;
    for (let n = -Math.floor(extent / grid) * grid; n <= extent; n += grid) {
      const axis = n === 0;
      lines.push(`<path d="M ${n} ${-extent} V ${extent} M ${-extent} ${n} H ${extent}" stroke="${axis ? '#c7d3c3' : '#e8ede3'}" stroke-width="${unit * (axis ? 1 : .7)}"/>`);
      if (!axis) labels.push(`<text x="${n}" y="${14 * unit}" text-anchor="middle">${n}</text><text x="${-9 * unit}" y="${-n + 3 * unit}" text-anchor="end">${n}</text>`);
    }
    let pathMarkup = '';
    if (waypoints.length > 1) waypoints.slice(1).forEach((b, i) => {
      const a = waypoints[i], bad = result?.segments?.[i]?.valid === false;
      pathMarkup += `<line x1="${a.x}" y1="${-a.y}" x2="${b.x}" y2="${-b.y}" stroke="${bad ? '#c76943' : '#87a578'}" stroke-width="${2 * unit}" ${bad ? `stroke-dasharray="${6 * unit} ${5 * unit}"` : ''}/>`;
    });
    const pointsMarkup = waypoints.map((p, i) => `<circle cx="${p.x}" cy="${-p.y}" r="${3.5 * unit}" fill="#fbfcf9" stroke="#809d71" stroke-width="${1.3 * unit}"/><text x="${p.x + 7 * unit}" y="${-p.y - 7 * unit}" font-size="${8 * unit}" fill="#738568">${i + 1}</text>`).join('');
    let arm = '';
    if (ik.reachable) {
      const ex = ik.elbow.x, ey = -ik.elbow.y, tx = ik.tip.x, ty = -ik.tip.y;
      arm = `<path d="M 0 0 L ${ex} ${ey}" stroke="#234f40" stroke-width="${12 * unit}" stroke-linecap="round"/><path d="M ${ex} ${ey} L ${tx} ${ty}" stroke="#81a18a" stroke-width="${10 * unit}" stroke-linecap="round"/><circle cx="0" cy="0" r="${11 * unit}" fill="#fff" stroke="#234f40" stroke-width="${4 * unit}"/><circle cx="0" cy="0" r="${3 * unit}" fill="#234f40"/><circle cx="${ex}" cy="${ey}" r="${9 * unit}" fill="#fff" stroke="#234f40" stroke-width="${3 * unit}"/><circle cx="${ex}" cy="${ey}" r="${2.8 * unit}" fill="#234f40"/><text x="${ex / 2 - 12 * unit}" y="${ey / 2 - 12 * unit}" fill="#345c47" font-size="${10 * unit}">L₁</text><text x="${(ex + tx) / 2 + 10 * unit}" y="${(ey + ty) / 2 - 8 * unit}" fill="#708a6e" font-size="${10 * unit}">L₂</text>`;
    } else {
      arm = `<circle r="${11 * unit}" fill="#fff" stroke="#96a593" stroke-width="${3 * unit}"/>`;
    }
    const shown = Math.abs(target.x) <= extent && Math.abs(target.y) <= extent;
    let targetMarkup = '';
    if (shown) targetMarkup = `<circle cx="${target.x}" cy="${-target.y}" r="${13 * unit}" fill="#d58a5b20"/><circle cx="${target.x}" cy="${-target.y}" r="${5.5 * unit}" fill="#c7784c" stroke="#fff" stroke-width="${2 * unit}"/><path d="M ${target.x - 19 * unit} ${-target.y} h ${7 * unit} M ${target.x + 12 * unit} ${-target.y} h ${7 * unit} M ${target.x} ${-target.y - 19 * unit} v ${7 * unit} M ${target.x} ${-target.y + 12 * unit} v ${7 * unit}" stroke="#c7784c" stroke-width="${unit}"/>`;
    $('stage').innerHTML = `<title>二维 2R 机械臂工作空间</title><desc>目标 X ${fmt(target.x)} mm，Y ${fmt(target.y)} mm；${ik.reachable ? '可达' : '不可达'}；共 ${waypoints.length} 个路点。</desc><circle r="${outer}" fill="#eaf1e5" opacity=".65"/><circle r="${inner}" fill="#fbfcf9"/>${lines.join('')}<circle r="${outer}" fill="none" stroke="#bdcdb4" stroke-width="${unit}" stroke-dasharray="${4 * unit} ${5 * unit}"/>${inner ? `<circle r="${inner}" fill="#f0ede61c" stroke="#d5c4af" stroke-width="${unit}" stroke-dasharray="${3 * unit} ${4 * unit}"/>` : ''}<g fill="#9aa68f" font-family="Consolas,monospace" font-size="${8 * unit}">${labels.join('')}</g>${pathMarkup}${pointsMarkup}${arm}${targetMarkup}<text x="${-extent + 17 * unit}" y="${-extent + 25 * unit}" font-family="Consolas,monospace" fill="#809173" font-size="${9 * unit}">TOP VIEW · XY PLANE</text>`;
    $('q1').textContent = ik.reachable ? `${fmt(K.degrees(ik.q1))}°` : '—';
    $('q2').textContent = ik.reachable ? `${fmt(K.degrees(ik.q2))}°` : '—';
    $('index-value').textContent = ik.reachable ? fmt(ik.index, 3) : '—';
    const warn = !ik.reachable || ik.index < .1;
    $('reach-badge').className = `badge${warn ? ' warn' : ''}`;
    $('reach-badge').textContent = !ik.reachable ? '目标不可达' : ik.ambiguous ? '原点逆解不唯一' : ik.singular ? '奇异位形' : ik.index < .1 ? '接近奇异位形' : '目标可达';
    $('target-note').textContent = !ik.reachable ? (ik.reason === 'inside' ? '目标位于内侧盲区。' : '目标超出最大可达半径。') + (shown ? '' : ' 目标在画面外。') : ik.ambiguous ? '原点有无穷多组肩关节角；当前仅展示一组解。' : ik.index < .1 ? '靠近奇异位形，关节角可能快速变化。' : '当前目标可达，可添加为路点。';
    $('add-point').disabled = !ik.reachable || ik.ambiguous || state.waypoints.length >= 200;
    $('l1-value').textContent = `${l1} mm`; $('l2-value').textContent = `${l2} mm`;
    $('workspace-range').textContent = `可达半径 ${inner}–${outer} mm`;
  }
  function replan() {
    stop(); playbackTime = 0; $('scrub').value = 0; $('play-time').textContent = '0.00 s';
    let error = null; result = null;
    if (state.waypoints.length >= 2) {
      try { result = K.plan(state); } catch (e) { error = e.message; }
    }
    $('point-count').textContent = state.waypoints.length;
    $('path-length').textContent = result ? fmt(result.length) : '—';
    $('duration').textContent = result?.valid ? fmt(result.duration, 2) : '—';
    $('sample-count').textContent = result?.valid ? result.samples.length : '—';
    const status = $('path-status');
    status.className = 'path-status';
    if (error) { status.textContent = error; status.classList.add('warn'); }
    else if (!result) { status.textContent = '添加至少两个路点，开始检查路径。'; status.classList.add('empty'); }
    else if (!result.valid) {
      status.textContent = `路径未通过 · ${result.invalid.map(s => `第 ${s.from + 1}→${s.to + 1} 段${reasonText[s.reason]}`).join('；')}。请调整路点后再回放或导出。`;
      status.classList.add('warn');
    } else if (result.length === 0) {
      status.textContent = '路点重合 · 路径长度为 0，仅导出初始姿态。'; status.classList.add('empty');
    } else if (result.minIndex < .1) {
      status.textContent = '几何可达，但路径接近奇异位形 · 本工具未检查关节速度限制，建议调整路点。'; status.classList.add('warn');
    } else status.textContent = '✓ 整段路径几何可达 · 未穿过内侧盲区，可以回放和导出。';
    const valid = !!result?.valid;
    $('export').disabled = !valid; $('play').disabled = !valid || result.duration === 0;
    $('scrub').disabled = !valid || result.duration === 0;
    $('undo').disabled = $('clear').disabled = state.waypoints.length === 0;
    $('waypoints').replaceChildren(...state.waypoints.map((p, i) => {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.className = 'waypoint';
      button.setAttribute('aria-label', `查看路点 ${i + 1}，X ${fmt(p.x)}，Y ${fmt(p.y)}`);
      const number = document.createElement('b'); number.textContent = String(i + 1).padStart(2, '0');
      button.append(number, document.createTextNode(`${fmt(p.x)} , ${fmt(p.y)}`));
      button.addEventListener('click', () => { stop(); state.target = { ...p }; targetToInputs(); draw(); });
      li.append(button); return li;
    }));
    draw();
  }
  function setPlayback(t) {
    if (!result?.valid) return;
    playbackTime = Math.max(0, Math.min(t, result.duration));
    const samples = result.samples;
    let lo = 0, hi = samples.length - 1;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (samples[mid].t < playbackTime) lo = mid + 1; else hi = mid; }
    const b = samples[lo], a = samples[Math.max(0, lo - 1)], span = b.t - a.t;
    const u = span > 0 ? Math.max(0, Math.min(1, (playbackTime - a.t) / span)) : 0;
    state.target = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    $('scrub').value = result.duration ? Math.round(playbackTime / result.duration * 1000) : 0;
    $('play-time').textContent = `${fmt(playbackTime, 2)} s`;
    targetToInputs(); draw();
  }
  function tick(time) {
    if (!playing) return;
    const elapsed = previousFrame === null ? 0 : (time - previousFrame) / 1000;
    previousFrame = time; setPlayback(playbackTime + elapsed);
    if (playbackTime >= result.duration) { stop(); return; }
    frame = requestAnimationFrame(tick);
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type })), anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  for (const key of ['l1', 'l2', 'branch', 'speed', 'step']) {
    $(key).addEventListener(key === 'l1' || key === 'l2' ? 'input' : 'change', () => {
      if (!$(key).checkValidity() || $(key).value === '') { $(key).reportValidity(); $(key).value = state[key]; return; }
      state[key] = Number($(key).value); replan();
    });
  }
  for (const axis of ['x', 'y']) $('target-' + axis).addEventListener('change', () => {
    const input = $('target-' + axis);
    if (!input.checkValidity() || input.value === '') { input.reportValidity(); targetToInputs(); return; }
    stop(); state.target[axis] = Number(input.value); draw();
  });
  function selectPointer(event) {
    const matrix = $('stage').getScreenCTM(); if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    stop(); state.target = { x: Math.max(-650, Math.min(650, p.x)), y: Math.max(-650, Math.min(650, -p.y)) };
    targetToInputs(); draw();
  }
  $('stage').addEventListener('pointerdown', e => { if (e.button !== 0) return; dragging = true; $('stage').setPointerCapture(e.pointerId); selectPointer(e); });
  $('stage').addEventListener('pointermove', e => { if (dragging) selectPointer(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('stage').addEventListener(type, () => { dragging = false; });
  $('add-point').addEventListener('click', () => {
    if ($('add-point').disabled) return;
    // Keep the full coordinate precision so displayed boundary targets stay reachable.
    state.waypoints.push({ ...state.target }); replan();
  });
  $('undo').addEventListener('click', () => { state.waypoints.pop(); replan(); });
  $('clear').addEventListener('click', () => { state.waypoints = []; replan(); });
  $('demo').addEventListener('click', () => {
    const outer = state.l1 + state.l2, inner = Math.abs(state.l1 - state.l2);
    const center = (outer + inner) / 2, radius = (outer - inner) * .25;
    state.waypoints = Array.from({ length: 25 }, (_, i) => ({ x: center + radius * Math.cos(i * Math.PI / 12), y: radius * Math.sin(i * Math.PI / 12) }));
    state.target = { ...state.waypoints[0] }; configToInputs(); replan(); notice('已载入 24 段闭合折线圆示例；连线为直线近似。');
  });
  $('hole-demo').addEventListener('click', () => {
    const outer = state.l1 + state.l2, inner = Math.abs(state.l1 - state.l2), r = (inner + outer) / 2;
    state.waypoints = [{ x: -r, y: 0 }, { x: r, y: 0 }]; state.target = { ...state.waypoints[0] };
    configToInputs(); replan(); notice('两个端点都可达，但中间穿过盲区；等长机械臂则穿过逆解不唯一的原点。');
  });
  $('play').addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (!result?.valid || !result.duration) return;
    if (playbackTime >= result.duration) playbackTime = 0;
    playing = true; previousFrame = null; $('play').textContent = 'Ⅱ 暂停回放'; frame = requestAnimationFrame(tick);
  });
  $('scrub').addEventListener('input', () => { stop(); setPlayback(Number($('scrub').value) / 1000 * (result?.duration || 0)); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  $('export').addEventListener('click', () => {
    try { download(K.toCSV(result, state), 'armpath-trajectory.csv', 'text/csv;charset=utf-8'); notice('CSV 已导出：时间、末端坐标、连续关节角和模型参数。'); }
    catch (e) { notice(e.message); }
  });
  $('save-project').addEventListener('click', () => download(JSON.stringify(state, null, 2) + '\n', 'armpath-project.json', 'application/json'));
  $('load-project').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      if (file.size > 256000) throw new Error('工程文件过大，最大为 250 KB。');
      const clean = K.validateProject(JSON.parse(await file.text()));
      stop(); state = clean; configToInputs(); replan(); notice('工程已载入。');
    } catch (error) { notice('打开失败：' + error.message); }
    finally { e.target.value = ''; }
  });
  configToInputs(); replan();
})();
