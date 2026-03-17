'use strict';

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;

// Directory to store uploaded sites
const SITES_DIR = process.env.UPLOAD_DIR_OVERRIDE
  ? path.join(process.env.UPLOAD_DIR_OVERRIDE, 'sites')
  : path.join(__dirname, 'uploads', 'sites');
fs.mkdirSync(SITES_DIR, { recursive: true });

// Temporary upload directory
const TEMP_DIR = process.env.UPLOAD_DIR_OVERRIDE
  ? path.join(process.env.UPLOAD_DIR_OVERRIDE, 'temp')
  : path.join(__dirname, 'uploads', 'temp');
fs.mkdirSync(TEMP_DIR, { recursive: true });

// Allowed file extensions for direct (non-zip) uploads
const ALLOWED_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.js', '.mjs',
  '.json', '.svg', '.ico',
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.ogg', '.mp3', '.wav',
  '.pdf', '.txt', '.xml',
  '.map',
]);

// Max upload size: 50 MB
const MAX_SIZE_BYTES = 50 * 1024 * 1024;

// Multer storage: save to temp directory with original filename preserved
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    // Sanitize filename to prevent directory traversal
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${uuidv4()}-${safeName}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.zip' || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${ext}" is not allowed. Upload a .zip or individual web files.`));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded sites
// Path: /sites/:siteId/<file>
app.use('/sites', express.static(SITES_DIR));

// ── API: Upload endpoint ──────────────────────────────────────────────────────

app.post('/api/upload', upload.array('files', 100), (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded.' });
  }

  const siteId = uuidv4();
  const siteDir = path.join(SITES_DIR, siteId);
  fs.mkdirSync(siteDir, { recursive: true });

  try {
    // Detect if a single zip was uploaded
    if (files.length === 1 && path.extname(files[0].originalname).toLowerCase() === '.zip') {
      extractZip(files[0].path, siteDir);
      fs.unlinkSync(files[0].path);
    } else {
      // Move individual files into the site directory
      for (const file of files) {
        // Use original safe name (strip the uuid prefix we added in diskStorage)
        const originalName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
        const dest = path.join(siteDir, originalName);
        fs.renameSync(file.path, dest);
      }
    }

    // Determine entry point
    const entryPoint = findEntryPoint(siteDir);

    // Store metadata
    const meta = {
      siteId,
      uploadedAt: new Date().toISOString(),
      entryPoint,
    };
    fs.writeFileSync(path.join(siteDir, '.meta.json'), JSON.stringify(meta, null, 2));

    return res.json({
      siteId,
      url: `/sites/${siteId}/${entryPoint}`,
      previewUrl: `/preview/${siteId}`,
    });
  } catch (err) {
    // Clean up on error
    fs.rmSync(siteDir, { recursive: true, force: true });
    for (const file of files) {
      try { fs.unlinkSync(file.path); } catch (_) { /* ignore */ }
    }
    return res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// ── API: List all sites ───────────────────────────────────────────────────────

app.get('/api/sites', (_req, res) => {
  try {
    const entries = fs.readdirSync(SITES_DIR, { withFileTypes: true });
    const sites = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const metaPath = path.join(SITES_DIR, entry.name, '.meta.json');
      if (!fs.existsSync(metaPath)) continue;
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      sites.push(meta);
    }
    sites.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    return res.json(sites);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Preview page ──────────────────────────────────────────────────────────────

app.get('/preview/:siteId', (req, res) => {
  const siteId = sanitiseSiteId(req.params.siteId);
  if (!siteId) return res.status(400).send('Invalid site ID.');

  const metaPath = path.join(SITES_DIR, siteId, '.meta.json');
  if (!fs.existsSync(metaPath)) return res.status(404).send('Site not found.');

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const siteUrl = `/sites/${siteId}/${meta.entryPoint}`;

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview – ${siteId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; height: 100vh; }
    .toolbar { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #1e293b; border-bottom: 1px solid #334155; flex-shrink: 0; }
    .toolbar a { color: #94a3b8; text-decoration: none; font-size: 13px; }
    .toolbar a:hover { color: #f8fafc; }
    .toolbar .sep { color: #475569; }
    .url-bar { flex: 1; background: #0f172a; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; color: #94a3b8; font-size: 13px; font-family: monospace; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .btn { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .btn-primary { background: #6366f1; color: #fff; }
    .btn-primary:hover { background: #4f46e5; }
    iframe { flex: 1; border: none; background: #fff; }
    .meta { font-size: 11px; color: #64748b; white-space: nowrap; }
  </style>
</head>
<body>
  <div class="toolbar">
    <a href="/">← Upload</a>
    <span class="sep">|</span>
    <a href="/sites.html">All Sites</a>
    <span class="sep">|</span>
    <div class="url-bar">${siteUrl}</div>
    <span class="meta">Uploaded ${new Date(meta.uploadedAt).toLocaleString()}</span>
    <a class="btn btn-primary" href="${siteUrl}" target="_blank">Open ↗</a>
  </div>
  <iframe src="${siteUrl}" title="Uploaded website preview"></iframe>
</body>
</html>`);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitiseSiteId(id) {
  if (typeof id !== 'string') return null;
  // UUIDs are hex + hyphens only
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  return id;
}

function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  // Detect if all entries share a single top-level directory (strip it)
  const topDirs = new Set(
    entries.map(e => e.entryName.split('/')[0]).filter(Boolean),
  );
  const singleRoot =
    topDirs.size === 1 &&
    entries.some(e => e.isDirectory && e.entryName === `${[...topDirs][0]}/`);
  const stripPrefix = singleRoot ? `${[...topDirs][0]}/` : '';

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    let entryName = entry.entryName;
    if (stripPrefix && entryName.startsWith(stripPrefix)) {
      entryName = entryName.slice(stripPrefix.length);
    }
    if (!entryName) continue; // was the root dir itself

    // Prevent zip slip: ensure resolved path is inside destDir
    const resolved = path.resolve(destDir, entryName);
    if (!resolved.startsWith(path.resolve(destDir) + path.sep)) {
      throw new Error('Invalid zip: path traversal detected.');
    }

    const ext = path.extname(entryName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue; // skip disallowed types silently

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, entry.getData());
  }
}

function findEntryPoint(dir) {
  const candidates = ['index.html', 'index.htm', 'default.html'];
  for (const name of candidates) {
    if (fs.existsSync(path.join(dir, name))) return name;
  }
  // Fall back to first .html file found (flat)
  const files = fs.readdirSync(dir);
  const html = files.find(f => f.endsWith('.html') || f.endsWith('.htm'));
  return html || files.find(f => !f.startsWith('.')) || 'index.html';
}

// ── Start server ──────────────────────────────────────────────────────────────

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dig server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
