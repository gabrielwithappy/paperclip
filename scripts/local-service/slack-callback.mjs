import http from 'node:http';
import { fileURLToPath } from 'node:url';

// Host replacement for docker/slack-callback/nginx.conf. Preserve raw bytes
// for Slack signature validation in Paperclip; never log request bodies.
export function createCallbackProxy({ port = 3110, hostname = '127.0.0.1' } = {}) {
  return http.createServer((req, res) => {
    const pathname = req.url?.split('?')[0];
    if (req.method !== 'POST' || !/^\/api\/chat-webhooks\/[A-Za-z0-9_-]+\/slack$/.test(pathname ?? '')) {
      res.writeHead(404).end();
      req.resume();
      return;
    }
    const chunks = [];
    let length = 0;
    req.on('data', (chunk) => {
      length += chunk.length;
      if (length > 1024 * 1024) {
        chunks.length = 0;
        if (!res.writableEnded) res.writeHead(413).end();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      const headers = { ...req.headers };
      // Do not forward caller-supplied routing or hop-by-hop headers.
      for (const name of (headers.connection ?? '').split(',')) delete headers[name.trim().toLowerCase()];
      for (const name of ['connection', 'transfer-encoding', 'upgrade', 'keep-alive', 'proxy-authorization',
        'proxy-authenticate', 'te', 'trailer', 'forwarded']) delete headers[name];
      headers['content-length'] = String(length);
      headers['x-forwarded-host'] = req.headers.host ?? 'localhost';
      headers['x-forwarded-proto'] = 'https';
      headers['x-forwarded-for'] = req.socket.remoteAddress;
      headers['x-real-ip'] = req.socket.remoteAddress;
      const upstream = http.request({ hostname, port, path: req.url, method: 'POST', headers }, (reply) => {
        res.writeHead(reply.statusCode, reply.headers);
        reply.pipe(res);
      });
      upstream.setTimeout(30_000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
      upstream.end(Buffer.concat(chunks));
    });
    req.on('error', () => { if (!res.writableEnded) res.destroy(); });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[2] === 'callback') {
  const server = createCallbackProxy({ port: Number(process.env.PORT || 3110) });
  server.requestTimeout = 30_000;
  server.listen(3111, '127.0.0.1', () => console.log('Slack callback: 127.0.0.1:3111 → 127.0.0.1:3110'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
