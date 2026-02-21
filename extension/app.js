const API_URL = 'http://localhost:3001';
let currentPath = '';
let selectedFile = null;
let clipboard = { op: null, path: null }; 
let viewMode = 'grid'; 
let sortBy = 'name';
let currentFiles = [];
let renderedFiles = []; // Para trackear el orden visual actual
let selectedFiles = []; // Nuevo array para selección múltiple
let lastSelectedIdx = -1;

// History
let historyStack = [];
let forwardStack = [];

// Viewer State
let monacoEditor = null;
let imgViewer = null;
let plyrPlayer = null;
let pdfDoc = null;
let pdfScale = 1.3;
let pdfObserver = null;

// --- OPEN WITH CONFIG ---
const INTERNAL_VIEWERS = {
    'image': { name: 'Visor de Imágenes', icon: 'image', exts: ['.jpg','.png','.gif','.webp','.svg'], action: (f,u) => openImage(f,u) },
    'video': { name: 'Reproductor de Vídeo', icon: 'film', exts: ['.mp4','.webm','.ogv','.mov','.mkv'], action: (f,u) => openVideo(f,u) },
    'audio': { name: 'Reproductor de Música', icon: 'music', exts: ['.mp3','.wav','.ogg','.m4a'], action: (f,u) => openAudio(f,u) },
    'pdf': { name: 'Visor PDF', icon: 'file-text', exts: ['.pdf'], action: (f,u) => openPdf(f,u) },
    'zip': { name: 'Explorador ZIP', icon: 'folder-archive', exts: ['.zip'], action: (f,u) => openZip(f,u) },
    'code': { name: 'Editor de Código', icon: 'code', exts: ['.js','.json','.html','.css','.ts','.py','.md','.txt'], action: (f,u) => openEditor(f,u) }
};

async function getPreferences() {
    return new Promise(resolve => {
        chrome.storage.local.get(['openWithPrefs'], (r) => resolve(r.openWithPrefs || {}));
    });
}

async function savePreference(ext, appId) {
    const prefs = await getPreferences();
    prefs[ext] = appId;
    chrome.storage.local.set({ openWithPrefs: prefs });
}

// --- INIT ---
async function init() {
    console.log("Bautilus Pro Init...");
    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');
    }

    // Configure Monaco Environment for Workers
    window.MonacoEnvironment = {
        getWorkerUrl: function(workerId, label) {
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                self.MonacoEnvironment = { baseUrl: '${chrome.runtime.getURL('vs')}' };
                importScripts('${chrome.runtime.getURL('vs/base/worker/workerMain.js')}');
            `)}`;
        }
    };
    
    if (window.require) {
        require.config({ paths: { 'vs': 'vs' } });
    }

    setupGlobalEvents();
    await loadSystemPaths();
    await loadCustomBookmarks();
    await navigateTo(''); 
}

async function navigateTo(path, addToHistory = true) {
    if (addToHistory && currentPath) historyStack.push(currentPath);
    if (addToHistory) forwardStack = [];
    
    // Clear selection on navigation
    selectedFiles = [];
    selectedFile = null;
    lastSelectedIdx = -1;
    if (document.getElementById('bottom-bar')) {
        document.getElementById('bottom-bar').classList.add('hidden');
    }

    try {
        const res = await fetch(`${API_URL}/files?path=${encodeURIComponent(path)}`);
        const data = await res.json();
        currentPath = data.currentPath;
        currentFiles = data.files;
        render();
        updateNavButtons();
    } catch (e) { console.error("Navigation error:", e); }
}

function updateNavButtons() {
    document.getElementById('btn-back').disabled = historyStack.length === 0;
    document.getElementById('btn-forward').disabled = forwardStack.length === 0;
    const isRoot = !currentPath || currentPath === '/' || (currentPath.includes(':') && currentPath.length <= 3);
    document.getElementById('btn-up').disabled = isRoot;
}

// --- RENDER ---
function render() {
    const fileView = document.getElementById('file-view');
    const listHeader = document.getElementById('list-header');
    
    fileView.innerHTML = '';
    fileView.className = `file-view ${viewMode}-view`;
    if (listHeader) listHeader.classList.toggle('hidden', viewMode !== 'list');
    
    const query = document.getElementById('search-input').value.toLowerCase();
    let filtered = currentFiles.filter(f => f.name.toLowerCase().includes(query));
    
    filtered.sort((a,b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        if (sortBy === 'date') return new Date(b.mtime) - new Date(a.mtime);
        if (sortBy === 'size') return b.size - a.size;
        return a.name.localeCompare(b.name);
    });

    renderedFiles = [...filtered];

    filtered.forEach(file => {
        const item = document.createElement('div');
        item.dataset.path = file.path;
        item.className = 'file-item' + (selectedFiles.some(sf => sf.path === file.path) ? ' selected' : '');
        
        const sizeStr = file.isDirectory ? '--' : formatSize(file.size);
        const dateStr = new Date(file.mtime).toLocaleDateString();
        const isVideo = ['.mp4','.webm','.ogv','.mov','.mkv'].includes(file.ext.toLowerCase());

        item.innerHTML = `
            <div class="thumb-container">
                <img src="${getAdwaitaIcon(file)}" class="icon-img">
                ${isVideo ? '<div class="video-badge"><i data-lucide="play" size="18"></i></div>' : ''}
            </div>
            <div class="name">${file.name}</div>
            <div class="file-meta">${sizeStr}</div>
            <div class="file-meta">${dateStr}</div>
        `;
        
        // Asynchronously load thumbnail if applicable
        if (!file.isDirectory) {
            const imgEl = item.querySelector('.icon-img');
            loadThumbnail(file, imgEl, item.querySelector('.thumb-container'));
        }

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            selectFile(file, e);
        });
        
        item.addEventListener('dblclick', () => {
            if (file.isDirectory) navigateTo(file.path);
            else handleFileOpen(file);
        });
        
        fileView.appendChild(item);
    });

    renderBreadcrumbs();
    updateActiveBookmark();
    document.getElementById('bottom-bar').classList.add('hidden');
    if (window.lucide) lucide.createIcons();
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function selectFile(file, event) {
    const idx = renderedFiles.findIndex(f => f.path === file.path);
    if (idx === -1) return;

    if (event.shiftKey && lastSelectedIdx !== -1) {
        // Range selection
        const start = Math.min(lastSelectedIdx, idx);
        const end = Math.max(lastSelectedIdx, idx);
        const range = renderedFiles.slice(start, end + 1);
        
        if (!event.ctrlKey && !event.metaKey) {
            selectedFiles = [...range];
        } else {
            // Ctrl+Shift: add range to existing
            range.forEach(f => {
                if (!selectedFiles.find(sf => sf.path === f.path)) {
                    selectedFiles.push(f);
                }
            });
        }
    } else if (event.ctrlKey || event.metaKey) {
        // Toggle item
        const existingIdx = selectedFiles.findIndex(sf => sf.path === file.path);
        if (existingIdx !== -1) {
            selectedFiles.splice(existingIdx, 1);
        } else {
            selectedFiles.push(file);
        }
        lastSelectedIdx = idx;
    } else {
        // Single selection
        selectedFiles = [file];
        lastSelectedIdx = idx;
    }

    // Compatibilidad con funciones existentes que usan 'selectedFile' (el último seleccionado)
    selectedFile = selectedFiles.length > 0 ? selectedFiles[selectedFiles.length - 1] : null;
    
    updateSelectionUI();
    renderSelectionState(); // Refrescar clases visuales sin re-renderizar todo
}

function updateSelectionUI() {
    const bar = document.getElementById('bottom-bar');
    const label = document.getElementById('selected-file-name');
    const barBm = document.getElementById('bar-bookmark');
    const barRename = document.getElementById('bar-rename');
    const barOpen = document.getElementById('bar-open');
    const barOpenWith = document.getElementById('bar-open-with');

    if (selectedFiles.length === 0) {
        bar.classList.add('hidden');
        return;
    }

    bar.classList.remove('hidden');
    if (selectedFiles.length === 1) {
        label.textContent = selectedFiles[0].name;
        barRename.classList.remove('hidden');
        barOpen.classList.remove('hidden');
        if (barOpenWith) barOpenWith.classList.remove('hidden');
        if (barBm) barBm.classList.toggle('hidden', !selectedFiles[0].isDirectory);
    } else {
        label.textContent = `${selectedFiles.length} elementos seleccionados`;
        barRename.classList.add('hidden'); // No se puede renombrar múltiple fácilmente
        barOpen.classList.add('hidden');   // Evitar abrir demasiadas ventanas por accidente
        if (barOpenWith) barOpenWith.classList.add('hidden');
        if (barBm) barBm.classList.add('hidden');
    }
}

function renderSelectionState() {
    document.querySelectorAll('.file-item').forEach(item => {
        const path = item.dataset.path;
        const isSelected = selectedFiles.some(sf => sf.path === path);
        item.classList.toggle('selected', isSelected);
    });
}

function renderBreadcrumbs() {
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = '';
    const isWindows = currentPath.includes(':');
    const parts = currentPath.split(/[\\\/]/).filter(p => p !== '');
    
    const addBtn = (text, path) => {
        const btn = document.createElement('button');
        btn.className = 'path-button';
        btn.textContent = text;
        btn.onclick = () => navigateTo(path);
        breadcrumb.appendChild(btn);
    };

    addBtn(isWindows ? 'Este Equipo' : 'Raíz', isWindows ? parts[0] + '\\' : '/');

    let buildPath = isWindows ? '' : '/';
    parts.forEach((part, i) => {
        if (isWindows && i === 0) { buildPath = part + '\\'; return; }
        const sep = document.createElement('span');
        sep.innerHTML = '<i data-lucide="chevron-right" width="12" style="opacity:0.5; margin:0 2px;"></i>';
        breadcrumb.appendChild(sep);
        buildPath = (buildPath.endsWith('\\') || buildPath.endsWith('/')) ? buildPath + part : buildPath + (isWindows ? '\\' : '/') + part;
        const target = buildPath;
        addBtn(part, target);
    });
    if (window.lucide) lucide.createIcons();
}

function getAdwaitaIcon(f) {
    if (f.isDirectory) {
        const n = f.name.toLowerCase();
        if (n.includes('desk')) return 'icons/adwaita/user-desktop.svg';
        if (n.includes('doc')) return 'icons/adwaita/folder-documents.svg';
        if (n.includes('down')) return 'icons/adwaita/folder-download.svg';
        return 'icons/adwaita/folder.svg';
    }
    const e = f.ext.toLowerCase();
    if (e === '.pdf') return 'icons/adwaita/file-pdf.svg';
    if (['.jpg','.png','.gif','.svg','.webp'].includes(e)) return 'icons/adwaita/file-image.svg';
    if (['.mp3','.wav','.ogg','.m4a'].includes(e)) return 'icons/adwaita/file-audio.svg';
    if (['.mp4','.webm','.ogv','.mov','.mkv'].includes(e)) return 'icons/adwaita/file-video.svg';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(e)) return 'icons/adwaita/file-archive.svg';
    if (['.html','.js','.css','.json','.ts'].includes(e)) return 'icons/adwaita/file-code.svg';
    return 'icons/adwaita/file-text.svg';
}

function setupGlobalEvents() {
    document.getElementById('btn-back').onclick = () => { if (historyStack.length > 0) { forwardStack.push(currentPath); navigateTo(historyStack.pop(), false); } };
    document.getElementById('btn-forward').onclick = () => { if (forwardStack.length > 0) { historyStack.push(currentPath); navigateTo(forwardStack.pop(), false); } };
    document.getElementById('btn-up').onclick = () => {
        const lastSep = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
        if (lastSep === -1) return;
        let parent = currentPath.substring(0, lastSep) || (currentPath.includes(':') ? currentPath.split('\\')[0] + '\\' : '/');
        if (parent.endsWith(':')) parent += '\\';
        navigateTo(parent);
    };
    
    document.getElementById('btn-view-toggle').onclick = () => { viewMode = viewMode === 'grid' ? 'list' : 'grid'; render(); };
    document.getElementById('search-input').oninput = () => render();
    document.getElementById('sort-select').onchange = (e) => { sortBy = e.target.value; render(); };

    // Action Bar
    document.getElementById('bar-open').onclick = () => selectedFile && handleFileOpen(selectedFile);
    document.getElementById('bar-open-with').onclick = () => selectedFile && handleFileOpen(selectedFile, true);
    document.getElementById('bar-close').onclick = () => {
        selectedFiles = [];
        selectedFile = null;
        updateSelectionUI();
        renderSelectionState();
    };
    
    document.getElementById('bar-copy').onclick = () => { 
        clipboard = { op: 'copy', paths: selectedFiles.map(f => f.path) }; 
        document.getElementById('paste-bar').classList.remove('hidden'); 
        document.getElementById('bottom-bar').classList.add('hidden');
    };
    document.getElementById('bar-cut').onclick = () => { 
        clipboard = { op: 'cut', paths: selectedFiles.map(f => f.path) }; 
        document.getElementById('paste-bar').classList.remove('hidden'); 
        document.getElementById('bottom-bar').classList.add('hidden');
    };
    
    document.getElementById('btn-clear-clipboard').onclick = () => {
        clipboard = { op: null, paths: null };
        document.getElementById('paste-bar').classList.add('hidden');
    };

    document.getElementById('btn-paste').onclick = async () => {
        if (!clipboard.paths || clipboard.paths.length === 0) return;
        const sep = currentPath.includes('\\') ? '\\' : '/';
        
        const promises = clipboard.paths.map(async (srcPath) => {
            const dest = currentPath + (currentPath.endsWith(sep) ? '' : sep) + srcPath.split(/[\\\/]/).pop();
            const ep = clipboard.op === 'copy' ? '/copy' : '/rename';
            return fetch(`${API_URL}${ep}`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(clipboard.op === 'copy' ? { source: srcPath, destination: dest } : { oldPath: srcPath, newPath: dest }) 
            });
        });

        await Promise.all(promises);
        
        if (clipboard.op === 'cut') {
            clipboard = { op: null, paths: null };
            document.getElementById('paste-bar').classList.add('hidden');
        }
        await navigateTo(currentPath, false);
    };

    document.getElementById('bar-bookmark').onclick = async () => {
        if (selectedFiles.length !== 1 || !selectedFiles[0].isDirectory) return;
        const file = selectedFiles[0];
        chrome.storage.local.get(['bookmarks'], (r) => {
            const list = r.bookmarks || [];
            if (!list.find(b => b.path === file.path)) {
                list.push({ name: file.name, path: file.path });
                chrome.storage.local.set({ bookmarks: list }, loadCustomBookmarks);
            }
        });
    };

    document.getElementById('bar-rename').onclick = () => {
        if (selectedFiles.length !== 1) return;
        const file = selectedFiles[0];
        const oldPath = file.path;
        showModal('Renombrar', file.name, async (newName) => {
            const sep = oldPath.includes('\\') ? '\\' : '/';
            const newPath = oldPath.substring(0, oldPath.lastIndexOf(sep) + 1) + newName;
            await fetch(`${API_URL}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath, newPath }) });
            navigateTo(currentPath, false);
        });
    };

    document.getElementById('bar-delete').onclick = async () => {
        if (selectedFiles.length === 0) return;
        const names = selectedFiles.length === 1 ? `"${selectedFiles[0].name}"` : `${selectedFiles.length} elementos`;
        if (confirm(`¿Eliminar definitivamente ${names}?`)) {
            const promises = selectedFiles.map(f => 
                fetch(`${API_URL}/delete`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ targetPath: f.path }) 
                })
            );
            await Promise.all(promises);
            navigateTo(currentPath, false);
        }
    };

    document.getElementById('btn-new-folder').onclick = () => {
        showModal('Nueva Carpeta', 'Carpeta nueva', async (name) => {
            await fetch(`${API_URL}/create-folder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentPath: currentPath, name }) });
            navigateTo(currentPath, false);
        });
    };

    // Global Close for Viewers
    document.querySelectorAll('.btn-close-viewer').forEach(btn => {
        btn.onclick = () => {
            const overlay = btn.closest('.preview-overlay');
            overlay.classList.add('hidden');
            if (overlay.id === 'code-overlay' && monacoEditor) {
                // Keep it for now or dispose
            }
            if (overlay.id === 'img-overlay' && imgViewer) {
                imgViewer.destroy();
                imgViewer = null;
            }
            if (overlay.id === 'audio-overlay' && plyrPlayer) {
                plyrPlayer.stop();
                plyrPlayer.destroy();
                plyrPlayer = null;
                const audio = document.getElementById('audio-player');
                if (audio) {
                    audio.src = '';
                }
            }
            if (overlay.id === 'video-overlay' && plyrPlayer) {
                plyrPlayer.stop();
                plyrPlayer.destroy();
                plyrPlayer = null;
                const video = document.getElementById('video-player');
                if (video) {
                    video.src = '';
                }
            }
            if (overlay.id === 'pdf-overlay') {
                const container = document.getElementById('pdf-container');
                const iframe = container.querySelector('iframe');
                if (iframe) {
                    // Try to clear blob URL if stored
                    const src = iframe.src;
                    if (src.includes('blob:')) {
                        const blobUrl = new URL(src).searchParams.get('file');
                        if (blobUrl) URL.revokeObjectURL(blobUrl);
                    }
                }
                container.innerHTML = '';
            }
        };
    });

    document.getElementById('btn-save-code').onclick = async () => {
        if (!monacoEditor || !selectedFile) return;
        const res = await fetch(`${API_URL}/save`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ targetPath: selectedFile.path, content: monacoEditor.getValue() }) 
        });
        if (res.ok) alert('Guardado con éxito.');
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.file-item') && !e.target.closest('.bottom-bar') && !e.target.closest('.preview-popup') && !e.target.closest('.modal-dialog')) {
            document.getElementById('bottom-bar').classList.add('hidden');
        }
    });
}

function showModal(title, val, action) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    const input = document.getElementById('modal-input');
    input.value = val;
    overlay.classList.remove('hidden');
    input.focus();
    document.getElementById('btn-modal-confirm').onclick = async () => { await action(input.value); overlay.classList.add('hidden'); };
    document.getElementById('btn-modal-cancel').onclick = () => overlay.classList.add('hidden');
}

async function handleFileOpen(file, forceModal = false) {
    const ext = file.ext.toLowerCase();
    const url = `${API_URL}/view?path=${encodeURIComponent(file.path)}`;
    
    // Check preferences
    const prefs = await getPreferences();
    const preferredAppId = prefs[ext];

    if (!forceModal && preferredAppId) {
        return executeOpenWith(preferredAppId, file, url);
    }

    // Determine compatible viewers
    const compatible = Object.entries(INTERNAL_VIEWERS).filter(([id, v]) => v.exts.includes(ext));
    
    // If only one internal viewer matches and no preference is set, prompt anyway? 
    // Or open directly? Requirement says "ask if not set".
    if (!forceModal && compatible.length === 1 && !preferredAppId) {
        showOpenWithModal(file, url, compatible);
    } else if (!forceModal && compatible.length === 0 && !preferredAppId) {
        // Unknown file type -> ask system or browser
        showOpenWithModal(file, url, []);
    } else {
        showOpenWithModal(file, url, compatible);
    }
}

async function executeOpenWith(appId, file, url) {
    if (INTERNAL_VIEWERS[appId]) {
        INTERNAL_VIEWERS[appId].action(file, url);
    } else if (appId === 'browser') {
        window.open(url, '_blank');
    } else if (appId === 'system') {
        await fetch(`${API_URL}/open-system`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ targetPath: file.path }) 
        });
    } else {
        alert("Aplicación no encontrada: " + appId);
    }
}

function showOpenWithModal(file, url, compatibleViewers) {
    const modal = document.getElementById('open-with-modal');
    const list = document.getElementById('app-list');
    const check = document.getElementById('always-open-check');
    const extSpan = document.getElementById('open-with-ext');
    
    modal.classList.remove('hidden');
    document.getElementById('open-with-filename').textContent = `¿Cómo quieres abrir "${file.name}"?`;
    extSpan.textContent = file.ext;
    check.checked = false;
    list.innerHTML = '';

    const addOption = (id, name, icon, tag = '') => {
        const div = document.createElement('div');
        div.className = 'app-item';
        div.innerHTML = `<i data-lucide="${icon}"></i><span>${name}</span>${tag ? `<span class="sys-tag">${tag}</span>` : ''}`;
        div.onclick = async () => {
            if (check.checked) {
                await savePreference(file.ext.toLowerCase(), id);
            }
            modal.classList.add('hidden');
            executeOpenWith(id, file, url);
        };
        list.appendChild(div);
    };

    // 1. Internal Viewers
    compatibleViewers.forEach(([id, v]) => addOption(id, v.name, v.icon, 'Bautilus'));

    // 2. Browser Tab
    addOption('browser', 'Navegador Web', 'globe', 'Externo');

    // 3. System Default
    addOption('system', 'App del Sistema (Predeterminada)', 'monitor', 'OS Default');

    // 4. Fallback: Code Editor
    if (!compatibleViewers.find(v => v[0] === 'code')) {
        addOption('code', 'Editor de Texto', 'file-text', 'Bautilus');
    }

    if (window.lucide) lucide.createIcons();

    // Close button logic inside modal
    modal.querySelector('.btn-close-viewer').onclick = () => modal.classList.add('hidden');
}

function openImage(file, url) {
    const ext = file.ext.replace('.','').toLowerCase();
    if (['jpg','png','gif','webp','svg'].includes(ext)) {
        const overlay = document.getElementById('img-overlay');
        overlay.classList.remove('hidden');
        document.getElementById('img-title').textContent = file.name;
        document.getElementById('btn-img-tab').onclick = () => window.open(url, '_blank');

        const container = overlay.querySelector('.image-content');
        container.innerHTML = `<img id="preview-img" src="${url}" style="display:none;">`;
        const img = document.getElementById('preview-img');

        if (imgViewer) {
            imgViewer.destroy();
        }

        img.onload = () => {
            imgViewer = new Viewer(img, {
                inline: true,
                container: container,
                button: false,
                navbar: false,
                title: false,
                toolbar: {
                    zoomIn: 4,
                    zoomOut: 4,
                    oneToOne: 4,
                    reset: 4,
                    rotateLeft: 4,
                    rotateRight: 4,
                    flipHorizontal: 4,
                    flipVertical: 4,
                },
                viewed() {
                    imgViewer.zoomTo(0.8);
                }
            });
        };
    }
}

async function openZip(file, url) {
    const overlay = document.getElementById('zip-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('zip-title').textContent = file.name;
    const list = document.getElementById('zip-list');
    list.innerHTML = '<div style="padding:20px;">Analizando archivo...</div>';
    
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const zip = await JSZip.loadAsync(blob);
        
        list.innerHTML = '';
        const files = Object.keys(zip.files).sort();
        
        files.forEach(filename => {
            if (filename.endsWith('/') && filename.length > 1) { // It's a directory
                const div = document.createElement('div');
                div.className = 'zip-entry';
                div.innerHTML = `<img src="icons/adwaita/folder.svg"><span class="zip-name">${filename}</span><span class="zip-size">--</span>`;
                list.appendChild(div);
            } else if (!filename.endsWith('/')) {
                const entry = zip.files[filename];
                const div = document.createElement('div');
                div.className = 'zip-entry';
                
                // Better icon logic based on extension
                const ext = filename.split('.').pop().toLowerCase();
                let icon = 'file-text.svg';
                if (['jpg','png','gif','svg'].includes(ext)) icon = 'file-image.svg';
                if (['js','html','css','ts','json'].includes(ext)) icon = 'file-code.svg';
                if (ext === 'pdf') icon = 'file-pdf.svg';

                const size = formatSize(entry._data.uncompressedSize || 0);
                
                div.innerHTML = `
                    <img src="icons/adwaita/${icon}">
                    <span class="zip-name">${filename}</span>
                    <span class="zip-size">${size}</span>
                `;
                list.appendChild(div);
            }
        });

        document.getElementById('btn-unzip-here').onclick = () => performUnzip(file.path, false);
        document.getElementById('btn-unzip-folder').onclick = () => performUnzip(file.path, true);

    } catch (e) {
        list.innerHTML = `<div style="color:red; padding:20px;">Error al leer ZIP: ${e.message}</div>`;
    }
}

async function performUnzip(zipPath, createFolder) {
    const btn1 = document.getElementById('btn-unzip-here');
    const btn2 = document.getElementById('btn-unzip-folder');
    const originalText1 = btn1.textContent;
    const originalText2 = btn2.textContent;
    
    btn1.disabled = true;
    btn2.disabled = true;
    btn1.textContent = 'Procesando...';

    try {
        const res = await fetch(`${API_URL}/unzip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zipPath, createFolder })
        });
        
        if (res.ok) {
            document.getElementById('zip-overlay').classList.add('hidden');
            navigateTo(currentPath, false);
        } else {
            const err = await res.json();
            alert(`Error al descomprimir: ${err.error}`);
        }
    } catch (e) {
        alert(`Error de red: ${e.message}`);
    } finally {
        btn1.disabled = false;
        btn2.disabled = false;
        btn1.textContent = originalText1;
        btn2.textContent = originalText2;
    }
}

async function openAudio(file, url) {
    const overlay = document.getElementById('audio-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('audio-title').textContent = file.name;
    document.getElementById('audio-filename').textContent = file.name;
    
    const audio = document.getElementById('audio-player');
    audio.src = url;
    
    if (plyrPlayer) {
        plyrPlayer.destroy();
    }
    
    // Create new Plyr instance
    plyrPlayer = new Plyr(audio, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume'],
        keyboard: { focused: true, global: true }
    });
    
    plyrPlayer.play();
}

async function openVideo(file, url) {
    const overlay = document.getElementById('video-overlay');
    overlay.classList.remove('hidden');
    document.getElementById('video-title').textContent = file.name;
    document.getElementById('btn-video-tab').onclick = () => window.open(url, '_blank');
    
    const video = document.getElementById('video-player');
    video.src = url;
    
    if (plyrPlayer) {
        plyrPlayer.destroy();
    }
    
    // Create new Plyr instance
    plyrPlayer = new Plyr(video, {
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
        keyboard: { focused: true, global: true },
        tooltips: { controls: true, seek: true }
    });
    
    plyrPlayer.play();
}

async function openEditor(file, url) {
    document.getElementById('code-overlay').classList.remove('hidden');
    document.getElementById('code-title').textContent = file.name;
    document.getElementById('btn-code-tab').onclick = () => window.open(url, '_blank');
    
    const res = await fetch(url);
    const text = await res.text();
    
    const container = document.getElementById('monaco-container');
    
    if (window.require) {
        require(['vs/editor/editor.main'], function() {
            if (monacoEditor) {
                monacoEditor.dispose();
            }
            container.innerHTML = '';
            monacoEditor = monaco.editor.create(container, {
                value: text, 
                language: getMonacoLanguage(file.ext), 
                theme: 'vs-dark', 
                automaticLayout: true,
                minimap: { enabled: true },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                renderWhitespace: 'none',
                tabSize: 4
            });
        });
    }
}

function getMonacoLanguage(ext) {
    const map = { '.js': 'javascript', '.json': 'json', '.html': 'html', '.css': 'css', '.py': 'python', '.md': 'markdown', '.ts': 'typescript' };
    return map[ext.toLowerCase()] || 'plaintext';
}

async function openPdf(file, url) {
    document.getElementById('pdf-overlay').classList.remove('hidden');
    document.getElementById('pdf-title').textContent = file.name;
    document.getElementById('btn-pdf-tab').onclick = () => window.open(url, '_blank');
    
    const container = document.getElementById('pdf-container');
    container.innerHTML = '<div style="color:white; padding:20px; font-family:sans-serif;">Cargando visor oficial...</div>';
    
    try {
        // Fetch the file as a blob to avoid cross-origin issues within the PDF.js iframe
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        
        container.innerHTML = '';
        
        const viewerUrl = chrome.runtime.getURL('pdfjs/web/viewer.html');
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        
        // Pass the blob URL to the viewer
        iframe.src = `${viewerUrl}?file=${encodeURIComponent(blobUrl)}`;
        
        container.appendChild(iframe);
        
        // Clean up the blob URL when the viewer is closed
        // This would require more logic in btn-close-viewer, 
        // but for now, the blob URL is stored in the iframe's src.
    } catch (e) {
        container.innerHTML = `<div style="color:#ff7b7b; padding:20px;">Error al cargar PDF: ${e.message}</div>`;
    }
}

async function renderPdfPage(num, container) {
    // This function is no longer needed with the official viewer iframe
}

async function loadSystemPaths() {
    try {
        const res = await fetch(`${API_URL}/system-paths`);
        const p = await res.json();
        const side = document.getElementById('system-bookmarks');
        side.innerHTML = '';
        const add = (n, i, path) => {
            const li = document.createElement('li');
            li.dataset.path = path;
            li.innerHTML = `<img src="icons/adwaita/${i}"> <span style="flex:1">${n}</span>`;
            li.onclick = () => navigateTo(path);
            side.appendChild(li);
        };
        add('Inicio', 'user-home.svg', p.home);
        add('Escritorio', 'user-desktop.svg', p.desktop);
        add('Documentos', 'folder-documents.svg', p.documents);
        add('Descargas', 'folder-download.svg', p.downloads);
    } catch(e) { console.error("Error loading system paths:", e); }
}

async function loadCustomBookmarks() {
    chrome.storage.local.get(['bookmarks'], (r) => {
        const list = r.bookmarks || [];
        const side = document.getElementById('custom-bookmarks');
        side.innerHTML = '';
        list.forEach(bm => {
            const li = document.createElement('li');
            li.dataset.path = bm.path;
            li.innerHTML = `<img src="icons/adwaita/folder.svg"> <span style="flex:1">${bm.name}</span> <div class="remove-bm"><i data-lucide="x" size="14"></i></div>`;
            li.onclick = () => navigateTo(bm.path);
            li.querySelector('.remove-bm').onclick = (e) => {
                e.stopPropagation();
                chrome.storage.local.set({ bookmarks: list.filter(b => b.path !== bm.path) }, loadCustomBookmarks);
            };
            side.appendChild(li);
        });
        if (window.lucide) lucide.createIcons();
        updateActiveBookmark();
    });
}

function updateActiveBookmark() {
    const norm = (p) => p.replace(/[\\\/]$/, '').toLowerCase();
    const current = norm(currentPath);
    document.querySelectorAll('.sidebar li').forEach(li => {
        const liPath = li.dataset.path;
        if (liPath && norm(liPath) === current) {
            li.classList.add('active');
        } else {
            li.classList.remove('active');
        }
    });
}

// --- THUMBNAIL MANAGER (IndexedDB) ---
const ThumbDB = {
    dbName: 'BautilusThumbs',
    storeName: 'thumbnails',
    version: 1,

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async get(id) {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    },

    async set(id, data) {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            store.put(data, id);
            tx.oncomplete = () => resolve();
        });
    }
};

async function loadThumbnail(file, imgEl, container) {
    if (file.isDirectory) return;

    const ext = file.ext.toLowerCase();
    const isImg = ['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext);
    const isVid = ['.mp4','.webm','.ogv','.mov','.mkv'].includes(ext);
    const isPdf = ext === '.pdf';

    if (!isImg && !isVid && !isPdf) return;

    const thumbId = `${file.path}_${file.mtime}`;
    const cached = await ThumbDB.get(thumbId);

    if (cached) {
        imgEl.src = cached;
        imgEl.classList.add('is-thumbnail');
        return;
    }

    const url = `${API_URL}/view?path=${encodeURIComponent(file.path)}`;
    let thumbData = null;

    try {
        if (isImg) thumbData = await generateImageThumb(url);
        else if (isVid) thumbData = await generateVideoThumb(url);
        else if (isPdf) thumbData = await generatePdfThumb(url);

        if (thumbData) {
            await ThumbDB.set(thumbId, thumbData);
            imgEl.src = thumbData;
            imgEl.classList.add('is-thumbnail');
        }
    } catch (e) { console.warn("Thumb gen error:", e); }
}

function generateImageThumb(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const size = 128; // Higher res for better display
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(size / img.width, size / img.height);
            const w = img.width * scale;
            const h = img.height * scale;
            ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = reject;
        img.src = url;
    });
}

function generateVideoThumb(url) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.crossOrigin = "anonymous";
        video.preload = "metadata";
        video.muted = true;
        video.onloadedmetadata = () => {
            video.currentTime = 1; // Try to capture at 1s
        };
        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            const scale = Math.max(128 / video.videoWidth, 128 / video.videoHeight);
            const w = video.videoWidth * scale;
            const h = video.videoHeight * scale;
            ctx.drawImage(video, (128 - w) / 2, (128 - h) / 2, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };
        video.onerror = reject;
        video.src = url;
    });
}

async function generatePdfThumb(url) {
    if (!window.pdfjsLib) return null;
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        
        // Use a small scale to get base dimensions
        const baseViewport = page.getViewport({ scale: 1.0 });
        const scale = 128 / Math.max(baseViewport.width, baseViewport.height);
        const viewport = page.getViewport({ scale: scale });
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        
        await page.render({ 
            canvasContext: ctx, 
            viewport: viewport 
        }).promise;
        
        return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) { console.error("PDF thumb error:", e); return null; }
}

init();
