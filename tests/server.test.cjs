/* SPDX-License-Identifier: MIT; Copyright (c) 2026 ArmPath Lite contributors */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createServer } = require('../scripts/serve.cjs');

async function preview(t) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  return (path, method = 'GET') => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: server.address().port, path, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    request.setTimeout(5000, () => request.destroy(new Error('Preview request timed out')));
    request.end();
  });
}

test('preview serves the entry page and assets with correct MIME types', async t => {
  const request = await preview(t);
  const page = await request('/');
  assert.equal(page.status, 200); assert.match(page.body, /ArmPath Lite/);
  assert.match(page.headers['content-type'], /^text\/html/);
  const script = await request('/src/kinematics.js');
  assert.equal(script.status, 200); assert.match(script.headers['content-type'], /^text\/javascript/);
});
test('preview rejects encoded NUL and malformed escapes and remains available', async t => {
  const request = await preview(t);
  for (const path of ['/%00', '/src/app.js%00', '/%zz']) {
    const bad = await request(path);
    assert.equal(bad.status, 400, path); assert.equal(bad.body, 'Bad request');
  }
  assert.equal((await request('/')).status, 200);
});
test('preview retains HEAD handling, hidden-file protection and method checks', async t => {
  const request = await preview(t);
  const head = await request('/styles.css', 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.body, '');
  assert.match(head.headers['content-type'], /^text\/css/);
  assert.equal((await request('/.git/config')).status, 404);
  assert.equal((await request('/%2e%2e%5cpackage.json')).status, 404);
  assert.equal((await request('/', 'POST')).status, 405);
});
