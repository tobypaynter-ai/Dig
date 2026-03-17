'use strict';

(function () {
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const fileList = document.getElementById('fileList');
  const fileListItems = document.getElementById('fileListItems');
  const clearBtn = document.getElementById('clearBtn');
  const uploadBtn = document.getElementById('uploadBtn');
  const progressPanel = document.getElementById('progressPanel');
  const resultPanel = document.getElementById('resultPanel');
  const shareUrl = document.getElementById('shareUrl');
  const copyBtn = document.getElementById('copyBtn');
  const previewBtn = document.getElementById('previewBtn');
  const uploadAnotherBtn = document.getElementById('uploadAnotherBtn');
  const errorPanel = document.getElementById('errorPanel');
  const errorMsg = document.getElementById('errorMsg');
  const retryBtn = document.getElementById('retryBtn');

  let selectedFiles = [];

  // ── Drag & drop ──────────────────────────────────────────────────────────

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener('change', () => {
    handleFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  // ── File handling ─────────────────────────────────────────────────────────

  function handleFiles(files) {
    if (!files.length) return;
    selectedFiles = files;
    renderFileList();
    showPanel('fileList');
  }

  function renderFileList() {
    fileListItems.innerHTML = '';
    for (const file of selectedFiles) {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="file-icon">${iconFor(file.name)}</span>
        <span class="file-name">${escHtml(file.name)}</span>
        <span class="file-size">${formatBytes(file.size)}</span>
      `;
      fileListItems.appendChild(li);
    }
  }

  clearBtn.addEventListener('click', () => {
    selectedFiles = [];
    showPanel('dropZone');
  });

  uploadBtn.addEventListener('click', doUpload);
  retryBtn.addEventListener('click', () => showPanel('dropZone'));
  uploadAnotherBtn.addEventListener('click', () => {
    selectedFiles = [];
    showPanel('dropZone');
  });

  // ── Upload ────────────────────────────────────────────────────────────────

  async function doUpload() {
    if (!selectedFiles.length) return;
    showPanel('progressPanel');

    const formData = new FormData();
    for (const file of selectedFiles) {
      formData.append('files', file);
    }

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      const fullPreviewUrl = window.location.origin + data.previewUrl;
      shareUrl.value = fullPreviewUrl;
      previewBtn.href = data.previewUrl;
      showPanel('resultPanel');
    } catch (err) {
      errorMsg.textContent = err.message;
      showPanel('errorPanel');
    }
  }

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrl.value).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  });

  // ── Panel switching ───────────────────────────────────────────────────────

  function showPanel(name) {
    const panels = { dropZone, fileList, progressPanel, resultPanel, errorPanel };
    for (const [key, el] of Object.entries(panels)) {
      el.hidden = key !== name;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function escHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function iconFor(name) {
    const ext = name.split('.').pop().toLowerCase();
    const map = {
      html: '🌐', htm: '🌐',
      css: '🎨',
      js: '⚙️', mjs: '⚙️',
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', webp: '🖼️',
      zip: '🗜️',
      pdf: '📄',
      json: '📋',
    };
    return map[ext] || '📄';
  }
})();
