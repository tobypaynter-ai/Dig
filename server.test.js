'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Point uploads at a temp directory so tests are isolated
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dig-test-'));
process.env.UPLOAD_DIR_OVERRIDE = tmpDir;

const app = require('./server');

let server;
let baseUrl;

before(() => {
  return new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(() => {
  server.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function request(opts, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadFiles(files) {
  const boundary = '----FormBoundary' + Math.random().toString(16).slice(2);
  let body = '';
  const buffers = [];

  for (const { name, content, type } of files) {
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${name}"\r\nContent-Type: ${type}\r\n\r\n`;
    buffers.push(Buffer.from(header, 'ascii'));
    buffers.push(typeof content === 'string' ? Buffer.from(content) : content);
    buffers.push(Buffer.from('\r\n', 'ascii'));
  }
  buffers.push(Buffer.from(`--${boundary}--\r\n`, 'ascii'));

  const buf = Buffer.concat(buffers);
  const url = new URL(`${baseUrl}/api/upload`);

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': buf.length,
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

describe('GET /api/sites', () => {
  test('returns JSON array', async () => {
    // First upload a site so we have something to verify structure against
    const html = '<!DOCTYPE html><html><body>structure test</body></html>';
    await uploadFiles([{ name: 'index.html', content: html, type: 'text/html' }]);

    const { status, body } = await request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/sites' });
    assert.equal(status, 200);
    const data = JSON.parse(body);
    assert.ok(Array.isArray(data));
    assert.ok(data.length > 0, 'should have at least one site');
    const site = data[0];
    assert.ok(typeof site.siteId === 'string', 'site should have siteId');
    assert.ok(typeof site.uploadedAt === 'string', 'site should have uploadedAt');
    assert.ok(typeof site.entryPoint === 'string', 'site should have entryPoint');
  });
});

describe('POST /api/upload', () => {
  test('rejects empty upload', async () => {
    const boundary = '----EmptyBoundary';
    const buf = Buffer.from(`--${boundary}--\r\n`);
    const res = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/upload',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': buf.length,
        },
      }, (r) => {
        let d = '';
        r.on('data', c => { d += c; });
        r.on('end', () => resolve({ status: r.statusCode, body: d }));
      });
      req.on('error', reject);
      req.write(buf);
      req.end();
    });
    assert.equal(res.status, 400);
    const data = JSON.parse(res.body);
    assert.ok(data.error);
  });

  test('accepts an HTML file and returns siteId + url', async () => {
    const html = '<!DOCTYPE html><html><head><title>T</title></head><body>Hello</body></html>';
    const res = await uploadFiles([{ name: 'index.html', content: html, type: 'text/html' }]);
    assert.equal(res.status, 200);
    const data = JSON.parse(res.body);
    assert.ok(data.siteId, 'should have siteId');
    assert.ok(data.url, 'should have url');
    assert.ok(data.previewUrl, 'should have previewUrl');
  });

  test('rejects disallowed file type', async () => {
    const res = await uploadFiles([{ name: 'malware.exe', content: 'binary', type: 'application/octet-stream' }]);
    assert.notEqual(res.status, 200);
  });
});

describe('GET /preview/:siteId', () => {
  test('returns 400 for invalid siteId', async () => {
    const res = await request({ hostname: '127.0.0.1', port: server.address().port, path: '/preview/../etc/passwd' });
    assert.notEqual(res.status, 200);
  });

  test('returns 404 for unknown siteId', async () => {
    const res = await request({ hostname: '127.0.0.1', port: server.address().port, path: '/preview/00000000-0000-0000-0000-000000000000' });
    assert.equal(res.status, 404);
  });

  test('returns preview page for valid upload', async () => {
    const html = '<!DOCTYPE html><html><body>Preview test</body></html>';
    const upload = await uploadFiles([{ name: 'index.html', content: html, type: 'text/html' }]);
    const { siteId } = JSON.parse(upload.body);

    const res = await request({ hostname: '127.0.0.1', port: server.address().port, path: `/preview/${siteId}` });
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('<iframe'), 'preview page should contain iframe');
  });
});
