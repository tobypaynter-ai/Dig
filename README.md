# Dig

**Share your locally-built websites with anyone, instantly.**

Dig is a lightweight Node.js web application that lets you upload HTML/CSS/JS websites from your computer and share them via a unique URL so someone else can review them.

## Features

- 📁 **Drag & drop or file picker** – upload individual files or a `.zip` of your whole site
- 🔗 **Shareable preview URLs** – every upload gets a unique link
- 🖼️ **Inline preview** – reviewers see the site in a framed preview with a toolbar
- 📋 **All sites listing** – browse every uploaded site at `/sites.html`
- 🔒 **Safe extraction** – zip-slip prevention and file-type allowlist

## Getting started

```bash
npm install
npm start
```

Then open <http://localhost:3000> in your browser.

## Usage

1. Open the app in your browser.
2. Drop your website files (or a `.zip`) onto the upload area.
3. Click **Upload & Share**.
4. Copy the link and send it to your reviewer.

## Supported file types

HTML, CSS, JS, JSON, SVG, images (PNG/JPG/GIF/WebP/AVIF), fonts (WOFF/WOFF2/TTF/OTF/EoT), audio/video (MP4/WebM/OGG/MP3/WAV), PDF, TXT, XML, source maps, and `.zip` archives.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |

