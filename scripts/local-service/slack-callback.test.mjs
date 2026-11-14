import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { createCallbackProxy } from './slack-callback.mjs';

test('callback forwards exact Slack body and signature and rejects other paths/methods', async (t) => {
  const received = [];
  const app = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.push({ body: Buffer.concat(chunks), headers: req.headers });
    res.writeHead(401).end('signature rejected');
  });
  app.listen(0, '127.0.0.1');
  await once(app, 'listening');
  const proxy = createCallbackProxy({ port: app.address().port });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(() => { proxy.closeAllConnections(); proxy.close(); app.closeAllConnections(); app.close(); });
  const base = `http://127.0.0.1:${proxy.address().port}`;
  const endpoint = '/api/chat-webhooks/endpoint-id/slack';
  const body = Buffer.from('{ "event": "한글", "raw": "\\n" }\n');
  const reply = await fetch(base + endpoint, { method: 'POST', body,
    headers: { 'x-slack-signature': 'v0=unchanged', 'x-slack-request-timestamp': '123' } });
  assert.equal(reply.status, 401);
  assert.equal(await reply.text(), 'signature rejected');
  assert.deepEqual(received[0].body, body);
  assert.equal(received[0].headers['x-slack-signature'], 'v0=unchanged');
  assert.equal(received[0].headers['x-slack-request-timestamp'], '123');
  assert.equal(received[0].headers['x-forwarded-proto'], 'https');
  for (const [url, method] of [[endpoint, 'GET'], ['/api/companies', 'POST'], ['/', 'GET'],
    [endpoint + '/extra', 'POST'], ['/api/chat-webhooks/a%2fb/slack', 'POST']]) {
    assert.equal((await fetch(base + url, { method })).status, 404);
  }
  assert.equal((await fetch(base + endpoint, { method: 'POST', body: Buffer.alloc(1024 * 1024 + 1) })).status, 413);
  assert.equal(received.length, 1);
});
