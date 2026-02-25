let API_URL = 'http://localhost:3001';

// Use origin if running as a web app from the backend
if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    API_URL = window.location.origin;
}

// Storage polyfill for web environment
const storage = {
    get: async (keys) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => chrome.storage.local.get(keys, resolve));
        } else {
            const res = {};
            for (const k of (Array.isArray(keys) ? keys : [keys])) {
                const val = localStorage.getItem(k);
                res[k] = val ? JSON.parse(val) : undefined;
            }
            return res;
        }
    },
    set: async (obj) => {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => chrome.storage.local.set(obj, resolve));
        } else {
            for (const k in obj) {
                localStorage.setItem(k, JSON.stringify(obj[k]));
            }
        }
    }
};

let currentPath = '';
let selectedFile = null;
let clipboard = { op: null, path: null }; 
let viewMode = 'grid'; 
let sortBy = 'name';
let currentFiles = [];
let renderedFiles = []; // Para trackear el orden visual actual
let selectedFiles = []; // Nuevo array para selección múltiple
let lastSelectedIdx = -1;

const urlParams = new URLSearchParams(window.location.search);
const APP_MODE = urlParams.get('mode') || 'normal'; // normal, picker, save
const SAVE_FILENAME_PARAM = urlParams.get('filename') || '';
const SAVE_URL_PARAM = urlParams.get('url') || '';
let currentLang = 'es';

const translations = {
    es: {
        places: "Lugares",
        bookmarks: "Marcadores",
        search: "Buscar...",
        sort_name: "Nombre",
        sort_date: "Fecha",
        sort_size: "Tamaño",
        name: "Nombre",
        size: "Tamaño",
        modified: "Modificado",
        open: "Abrir",
        open_with: "Abrir con...",
        copy: "Copiar",
        cut: "Cortar",
        rename: "Renombrar",
        add_bookmark: "Añadir marcador",
        delete: "Eliminar",
        paste_here: "Pegar aquí",
        title: "Título",
        cancel: "Cancelar",
        accept: "Aceptar",
        editor: "Editor",
        save: "Guardar",
        image: "Imagen",
        pdf: "PDF",
        zip_contents: "Contenido del ZIP",
        extract_here: "Extraer aquí",
        extract_to_folder: "Extraer en carpeta",
        player: "Reproductor",
        video: "Vídeo",
        select_app: "Selecciona una aplicación",
        always_use_this_app: "Usar siempre esta aplicación para archivos",
        items_selected: "elementos seleccionados",
        this_pc: "Este Equipo",
        root: "Raíz",
        new_folder: "Nueva Carpeta",
        new_folder_name: "Carpeta nueva",
        saved_success: "Guardado con éxito.",
        delete_confirm: "¿Eliminar definitivamente {names}?",
        analyzing_zip: "Analizando archivo...",
        error_zip: "Error al leer ZIP",
        processing: "Procesando...",
        error_unzip: "Error al descomprimir",
        network_error: "Error de red",
        loading_pdf: "Cargando visor oficial...",
        error_pdf: "Error al cargar PDF",
        home: "Inicio",
        desktop: "Escritorio",
        documents: "Documentos",
        downloads: "Descargas",
        img_viewer: "Visor de Imágenes",
        video_player: "Reproductor de Vídeo",
        music_player: "Reproductor de Música",
        pdf_viewer: "Visor PDF",
        zip_explorer: "Explorador ZIP",
        code_editor: "Editor de Código",
        web_browser: "Navegador Web",
        external: "Externo",
        system_app: "App del Sistema (Predeterminada)",
        os_default: "OS Default",
        text_editor: "Editor de Texto",
        bautilus: "Bautilus",
        app_not_found: "Aplicación no encontrada: ",
        select: "Seleccionar",
        name_label: "Nombre:",
        save_here: "Guardar Aquí",
        select_valid_file: "Selecciona un archivo válido",
        error_no_filename: "Por favor, escribe un nombre de archivo.",
        check_updates: "Comprobar actualizaciones",
        update_available: "¡Nueva actualización disponible!",
        later: "Más tarde",
        update_now: "Actualizar ahora",
        no_update_found: "Ya tienes la última versión instalada.",
        up_to_date: "Bautilus está actualizado.",
        is_available: "está disponible",
        current_version: "Tu versión:",
        settings: "Configuración",
        server_interface: "Interfaz (IP)",
        server_port: "Puerto",
        restart_warning: "Los cambios se guardarán. Es posible que el servidor necesite reiniciarse.",
        ext_connection: "Conexión de la Extensión",
        backend_url: "URL del Backend",
        server_config: "Configuración del Servidor",
        apply: "Aplicar",
        save_server: "Guardar en Servidor",
        connection_error: "Error de conexión con el servidor"
    },
    en: {
        places: "Places",
        bookmarks: "Bookmarks",
        search: "Search...",
        sort_name: "Name",
        sort_date: "Date",
        sort_size: "Size",
        name: "Name",
        size: "Size",
        modified: "Modified",
        open: "Open",
        open_with: "Open with...",
        copy: "Copy",
        cut: "Cut",
        rename: "Rename",
        add_bookmark: "Add Bookmark",
        delete: "Delete",
        paste_here: "Paste here",
        title: "Title",
        cancel: "Cancel",
        accept: "Accept",
        editor: "Editor",
        save: "Save",
        image: "Image",
        pdf: "PDF",
        zip_contents: "ZIP Contents",
        extract_here: "Extract here",
        extract_to_folder: "Extract to folder",
        player: "Player",
        video: "Video",
        select_app: "Select an application",
        always_use_this_app: "Always use this application for",
        items_selected: "items selected",
        this_pc: "This PC",
        root: "Root",
        new_folder: "New Folder",
        new_folder_name: "New folder",
        saved_success: "Saved successfully.",
        delete_confirm: "Permanently delete {names}?",
        analyzing_zip: "Analyzing file...",
        error_zip: "Error reading ZIP",
        processing: "Processing...",
        error_unzip: "Error unzipping",
        network_error: "Network error",
        loading_pdf: "Loading official viewer...",
        error_pdf: "Error loading PDF",
        home: "Home",
        desktop: "Desktop",
        documents: "Documents",
        downloads: "Downloads",
        img_viewer: "Image Viewer",
        video_player: "Video Player",
        music_player: "Music Player",
        pdf_viewer: "PDF Viewer",
        zip_explorer: "ZIP Explorer",
        code_editor: "Code Editor",
        web_browser: "Web Browser",
        external: "External",
        system_app: "System App (Default)",
        os_default: "OS Default",
        text_editor: "Text Editor",
        bautilus: "Bautilus",
        app_not_found: "Application not found: ",
        select: "Select",
        name_label: "Name:",
        save_here: "Save Here",
        select_valid_file: "Select a valid file",
        error_no_filename: "Please write a filename.",
        check_updates: "Check for updates",
        update_available: "New update available!",
        later: "Later",
        update_now: "Update now",
                no_update_found: "You already have the latest version.",
                up_to_date: "Bautilus is up to date.",
                settings: "Settings",
                server_interface: "Interface (IP)",
                server_port: "Port",
                restart_warning: "Changes will be saved. The server may need to restart.",
                ext_connection: "Extension Connection",
                backend_url: "Backend URL",
                server_config: "Server Configuration",
                apply: "Apply",
                save_server: "Save to Server",
                connection_error: "Connection error with server"
        ,
        settings: "Settings",
        server_interface: "Interface (IP)",
        server_port: "Port",
        restart_warning: "Changes will be saved. The server may need to restart."
    }
};

function t(key, vars = {}) {
    let text = translations[currentLang][key] || key;
    for (const v in vars) {
        text = text.replace(`{${v}}`, vars[v]);
    }
    return text;
}

function updateUI() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    document.documentElement.lang = currentLang;
}

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
const getInternalViewers = () => ({
    'image': { name: t('img_viewer'), icon: 'image', exts: ['.jpg','.png','.gif','.webp','.svg'], action: (f,u) => openImage(f,u) },
    'video': { name: t('video_player'), icon: 'film', exts: ['.mp4','.webm','.ogv','.mov','.mkv'], action: (f,u) => openVideo(f,u) },
    'audio': { name: t('music_player'), icon: 'music', exts: ['.mp3','.wav','.ogg','.m4a'], action: (f,u) => openAudio(f,u) },
    'pdf': { name: t('pdf_viewer'), icon: 'file-text', exts: ['.pdf'], action: (f,u) => openPdf(f,u) },
    'zip': { name: t('zip_explorer'), icon: 'folder-archive', exts: ['.zip'], action: (f,u) => openZip(f,u) },
    'code': { name: t('code_editor'), icon: 'code', exts: ['.js','.json','.html','.css','.ts','.py','.md','.txt'], action: (f,u) => openEditor(f,u) }
});

async function getPreferences() {
    const r = await storage.get(['openWithPrefs']);
    return r.openWithPrefs || {};
}

async function savePreference(ext, appId) {
    const prefs = await getPreferences();
    prefs[ext] = appId;
    await storage.set({ openWithPrefs: prefs });
}

// --- INIT ---
async function init() {
    console.log("Bautilus Pro Init...");
    
    // Load Server Config from Storage (if extension)
    const srv = await storage.get(['serverUrl']);
    if (srv.serverUrl) API_URL = srv.serverUrl;

    // Load Language
    const prefs = await storage.get(['lang']);
    currentLang = prefs.lang || 'es';
    document.getElementById('lang-select').value = currentLang;
    updateUI();

    // Check for "setup" mode in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup')) {
        openSettingsModal();
    }

    if (window.pdfjsLib) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('pdf.worker.min.js') : 'pdf.worker.min.js';
    }

    // Configure Monaco Environment for Workers
    window.MonacoEnvironment = {
        getWorkerUrl: function(workerId, label) {
            const baseUrl = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getURL('vs') : 'vs';
            return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                self.MonacoEnvironment = { baseUrl: '${baseUrl}' };
                importScripts('${baseUrl}/base/worker/workerMain.js');
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

    // Check for updates from storage
    const upd = await storage.get(['updateAvailable']);
    if (upd.updateAvailable) {
        showUpdateModal(upd.updateAvailable);
    }
}

function showUpdateModal(updateEntry) {
    const overlay = document.getElementById('update-overlay');
    const text = document.getElementById('update-text');
    const btnNow = document.getElementById('btn-update-now');
    const btnLater = document.getElementById('btn-update-later');

    const currentVersion = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.getManifest().version : 'web';
    // updateEntry.id looks like "bautilus-v1.0"
    const newVersion = updateEntry.id.split('-v')[1] || updateEntry.id;

    text.textContent = `${t('bautilus')} ${newVersion} ${t('is_available') || '(v'+newVersion+')'}. ${t('current_version') || 'Tu versión:'} ${currentVersion}`;
    btnNow.href = updateEntry.url;
    
    overlay.classList.remove('hidden');
    
    btnLater.onclick = () => overlay.classList.add('hidden');
    btnNow.onclick = () => {
        // We can keep it open or close it
        overlay.classList.add('hidden');
    };
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
    
    // In Windows, we can go "up" from C:\ to "This PC" (root)
    const isAbsoluteRoot = currentPath === 'root' || (!currentPath.includes(':') && currentPath === '/');
    document.getElementById('btn-up').disabled = isAbsoluteRoot;
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

        const isDrive = currentPath === 'root';
        const iconSrc = isDrive ? 'icons/adwaita/user-home.svg' : getAdwaitaIcon(file);
        const iconStyle = isDrive ? 'style="filter: hue-rotate(200deg)"' : '';

        item.innerHTML = `
            <div class="thumb-container">
                <img src="${iconSrc}" class="icon-img" ${iconStyle}>
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
    if (APP_MODE === 'save') return; // Save mode doesn't use file selection actions

    if (APP_MODE === 'picker') {
        const btnSelect = document.getElementById('btn-picker-select');
        const label = document.getElementById('picker-filename');
        
        if (selectedFiles.length === 1 && !selectedFiles[0].isDirectory) {
            btnSelect.disabled = false;
            label.textContent = selectedFiles[0].name;
        } else {
            btnSelect.disabled = true;
            label.textContent = selectedFiles.length > 0 ? t('select_valid_file') : '';
        }
        return;
    }

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
        label.textContent = `${selectedFiles.length} ${t('items_selected')}`;
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
    
    if (currentPath === 'root') {
        const btn = document.createElement('button');
        btn.className = 'path-button';
        btn.textContent = t('this_pc');
        btn.onclick = () => navigateTo('root');
        breadcrumb.appendChild(btn);
        return;
    }

    const isWindows = currentPath.includes(':');
    const parts = currentPath.split(/[\\\/]/).filter(p => p !== '');
    
    const addBtn = (text, path) => {
        const btn = document.createElement('button');
        btn.className = 'path-button';
        btn.textContent = text;
        btn.onclick = () => navigateTo(path);
        breadcrumb.appendChild(btn);
    };

    const addSep = () => {
        const sep = document.createElement('span');
        sep.innerHTML = '<i data-lucide="chevron-right" width="12" style="opacity:0.5; margin:0 2px;"></i>';
        breadcrumb.appendChild(sep);
    };

    if (isWindows) {
        addBtn(t('this_pc'), 'root');
        addSep();
    } else {
        addBtn(t('root'), '/');
    }

    let buildPath = isWindows ? '' : '/';
    parts.forEach((part, i) => {
        if (i > 0 || !isWindows) addSep();
        
        if (isWindows && i === 0) {
            buildPath = part.endsWith(':') ? part + '\\' : part;
        } else {
            const separator = isWindows ? '\\' : '/';
            buildPath = buildPath.endsWith(separator) ? buildPath + part : buildPath + separator + part;
        }
        
        addBtn(part, buildPath);
    });
    if (window.lucide) lucide.createIcons();
}

function getAdwaitaIcon(f) {
    if (f.isDirectory) {
        const n = f.name.toLowerCase();
        if (n.includes('desk')) return 'icons/adwaita/user-desktop.svg';
        if (n.includes('doc')) return 'icons/adwaita/folder-documents.svg';
        if (n.includes('down')) return 'icons/adwaita/folder-download.svg';
        if (n.includes('music')) return 'icons/adwaita/folder-music.svg';
        if (n.includes('pict') || n.includes('imag')) return 'icons/adwaita/folder-pictures.svg';
        if (n.includes('video') || n.includes('film')) return 'icons/adwaita/folder-videos.svg';
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
    document.getElementById('lang-select').onchange = (e) => {
        currentLang = e.target.value;
        chrome.storage.local.set({ lang: currentLang }, () => {
            updateUI();
            render();
            loadSystemPaths();
            loadCustomBookmarks();
        });
    };

    document.getElementById('btn-back').onclick = () => { if (historyStack.length > 0) { forwardStack.push(currentPath); navigateTo(historyStack.pop(), false); } };
    document.getElementById('btn-forward').onclick = () => { if (forwardStack.length > 0) { historyStack.push(currentPath); navigateTo(forwardStack.pop(), false); } };
    document.getElementById('btn-up').onclick = () => {
        if (!currentPath || currentPath === 'root') return;
        
        const isWindows = currentPath.includes(':');
        // If we are at C:\ or similar, go to virtual root
        if (isWindows && currentPath.length <= 3) {
            navigateTo('root');
            return;
        }

        const lastSep = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
        if (lastSep === -1) {
            navigateTo(isWindows ? 'root' : '/');
            return;
        }

        let parent = currentPath.substring(0, lastSep);
        if (parent === '' || (isWindows && parent.endsWith(':'))) {
            parent = isWindows ? parent + '\\' : '/';
        }
        navigateTo(parent);
    };
    
    document.getElementById('btn-view-toggle').onclick = () => { viewMode = viewMode === 'grid' ? 'list' : 'grid'; render(); };
    document.getElementById('search-input').oninput = () => render();
    document.getElementById('sort-select').onchange = (e) => { sortBy = e.target.value; render(); };

    document.getElementById('btn-downloads').onclick = (e) => {
        e.stopPropagation();
        document.getElementById('downloads-popover').classList.toggle('hidden');
        if (!document.getElementById('downloads-popover').classList.contains('hidden')) {
            updateDownloads();
        }
    };

    document.getElementById('btn-clear-downloads').onclick = async (e) => {
        e.stopPropagation();
        try {
            await fetch(`${API_URL}/clear-downloads`, { method: 'POST' });
            updateDownloads();
        } catch (e) { console.error("Error clearing downloads:", e); }
    };

    document.getElementById('btn-settings').onclick = () => openSettingsModal();

    document.getElementById('btn-save-ext-config').onclick = async () => {
        const newUrl = document.getElementById('ext-api-url').value;
        if (newUrl) {
            API_URL = newUrl;
            await storage.set({ serverUrl: API_URL });
            alert(t('saved_success'));
            openSettingsModal(); // Refresh to check connection
        }
    };

    document.getElementById('btn-save-settings').onclick = async () => {
        const interfaceVal = document.getElementById('settings-interface').value;
        const portVal = document.getElementById('settings-port').value;
        
        try {
            const res = await fetch(`${API_URL}/set-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ interface: interfaceVal, port: portVal })
            });
            
            if (res.ok) {
                alert(t('restart_warning'));
                document.getElementById('settings-overlay').classList.add('hidden');
            } else {
                alert('Error saving settings');
            }
        } catch (e) {
            alert(t('connection_error') + ': ' + e.message);
        }
    };

    document.getElementById('btn-check-updates').onclick = () => {
        const btn = document.getElementById('btn-check-updates');
        btn.classList.add('spinning'); // CSS class to animate if wanted
        
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'check_updates_manual' }, (response) => {
                btn.classList.remove('spinning');
                if (response && response.updateAvailable) {
                    showUpdateModal(response.updateAvailable);
                } else {
                    alert(t('up_to_date'));
                }
            });
        } else {
            btn.classList.remove('spinning');
            alert(t('up_to_date'));
        }
    };

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
        showModal(t('rename'), file.name, async (newName) => {
            const sep = oldPath.includes('\\') ? '\\' : '/';
            const newPath = oldPath.substring(0, oldPath.lastIndexOf(sep) + 1) + newName;
            await fetch(`${API_URL}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPath, newPath }) });
            navigateTo(currentPath, false);
        });
    };

    document.getElementById('bar-delete').onclick = async () => {
        if (selectedFiles.length === 0) return;
        const names = selectedFiles.length === 1 ? `"${selectedFiles[0].name}"` : `${selectedFiles.length} ${t('items_selected')}`;
        if (confirm(t('delete_confirm', { names }))) {
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
        showModal(t('new_folder'), t('new_folder_name'), async (name) => {
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
            if (overlay.id === 'settings-overlay') {
                // No extra cleanup
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
        if (res.ok) alert(t('saved_success'));
    };

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.file-item') && !e.target.closest('.bottom-bar') && !e.target.closest('.preview-popup') && !e.target.closest('.modal-dialog') && !e.target.closest('#picker-bar') && !e.target.closest('#save-bar')) {
            document.getElementById('bottom-bar').classList.add('hidden');
        }
    });

    // --- APP MODE HANDLERS ---
    if (APP_MODE === 'picker') {
        const bar = document.getElementById('picker-bar');
        if (bar) bar.classList.remove('hidden');
        document.getElementById('bottom-bar').classList.add('hidden'); 

        const btnCancel = document.getElementById('btn-picker-cancel');
        if (btnCancel) btnCancel.onclick = () => window.close();

        const btnSelect = document.getElementById('btn-picker-select');
        if (btnSelect) {
            btnSelect.onclick = () => {
                if (selectedFile && !selectedFile.isDirectory) {
                    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                        chrome.runtime.sendMessage({
                            action: 'file_selected_in_picker',
                            file: {
                                url: `${API_URL}/view?path=${encodeURIComponent(selectedFile.path)}`,
                                name: selectedFile.name,
                                type: selectedFile.ext.replace('.', '')
                            }
                        });
                    } else {
                        // Web app mode: Download instead?
                        window.open(`${API_URL}/view?path=${encodeURIComponent(selectedFile.path)}`, '_blank');
                    }
                }
            };
        }
    } else if (APP_MODE === 'save') {
        const bar = document.getElementById('save-bar');
        if (bar) bar.classList.remove('hidden');
        document.getElementById('bottom-bar').classList.add('hidden'); 

        const inp = document.getElementById('save-filename-input');
        if (inp && !inp.value && SAVE_FILENAME_PARAM) inp.value = SAVE_FILENAME_PARAM;
        
        const btnCancel = document.getElementById('btn-save-cancel');
        if (btnCancel) btnCancel.onclick = () => window.close();

        const btnConfirm = document.getElementById('btn-save-confirm');
        if (btnConfirm) {
            btnConfirm.onclick = () => {
                const filename = inp ? inp.value : '';
                if (!filename) return alert(t('error_no_filename'));
                
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                    chrome.runtime.sendMessage({
                        action: 'save_target_selected',
                        fileUrl: SAVE_URL_PARAM,
                        targetPath: currentPath,
                        filename: filename
                    });
                } else {
                    // Web app mode: Use server to download
                    fetch(`${API_URL}/download-from-url`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: SAVE_URL_PARAM, targetPath: currentPath, filename })
                    }).then(r => r.ok ? alert(t('saved_success')) : alert('Error downloading file'));
                }
            };
        }
    }
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

async function openSettingsModal() {
    const overlay = document.getElementById('settings-overlay');
    const srvSection = document.getElementById('server-settings-section');
    const errorBox = document.getElementById('server-connection-error');
    
    document.getElementById('ext-api-url').value = API_URL;
    overlay.classList.remove('hidden');
    
    try {
        const res = await fetch(`${API_URL}/get-config`);
        if (res.ok) {
            const config = await res.json();
            document.getElementById('settings-interface').value = config.interface;
            document.getElementById('settings-port').value = config.port;
            srvSection.classList.remove('hidden');
            errorBox.classList.add('hidden');
        } else {
            throw new Error();
        }
    } catch (e) { 
        console.error('Error fetching settings:', e); 
        srvSection.classList.add('hidden');
        errorBox.classList.remove('hidden');
    }
}

async function updateDownloads() {
    try {
        const res = await fetch(`${API_URL}/downloads`);
        if (!res.ok) throw new Error();
        
        const downloads = await res.json();
        const activeCount = downloads.filter(d => d.status === 'downloading').length;
        const badge = document.getElementById('download-badge');
        
        if (activeCount > 0) {
            badge.textContent = activeCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        const popover = document.getElementById('downloads-popover');
        if (!popover.classList.contains('hidden')) {
            const list = document.getElementById('downloads-list');
            list.innerHTML = '';
            
            if (downloads.length === 0) {
                list.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted); font-size:12px;">No hay descargas recientes</div>`;
            } else {
                downloads.sort((a,b) => b.startTime - a.startTime).forEach(d => {
                    const item = document.createElement('div');
                    item.className = 'download-item';
                    
                    const percent = d.total > 0 ? Math.min(100, Math.round((d.received / d.total) * 100)) : 0;
                    const statusClass = d.status === 'completed' ? 'completed' : (d.status === 'error' ? 'error' : '');
                    let statusText = d.status === 'completed' ? 'Completado' : (d.status === 'error' ? 'Error' : `${percent}%`);
                    
                    if (d.status === 'downloading' && d.total === 0) statusText = 'Descargando...';

                    item.innerHTML = `
                        <div class="download-info">
                            <span class="download-name" title="${d.filename}">${d.filename}</span>
                            <span class="download-status">${statusText}</span>
                        </div>
                        <div class="download-progress-container">
                            <div class="download-progress-bar ${statusClass}" style="width: ${d.status === 'completed' ? '100%' : percent + '%'}"></div>
                        </div>
                        ${d.status === 'completed' ? `
                        <div class="download-actions">
                            <button class="download-btn-action">Ver ubicación</button>
                        </div>` : ''}
                    `;

                    const btn = item.querySelector('.download-btn-action');
                    if (btn) {
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            const lastSep = Math.max(d.path.lastIndexOf('/'), d.path.lastIndexOf('\\'));
                            const dir = d.path.substring(0, lastSep) || (d.path.includes(':') ? d.path.split('\\')[0] + '\\' : '/');
                            navigateTo(dir);
                            popover.classList.add('hidden');
                        };
                    }
                    list.appendChild(item);
                });
            }
        }
    } catch (e) { 
        document.getElementById('download-badge').classList.add('hidden');
    }
}
setInterval(updateDownloads, 2000);

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
    const viewers = getInternalViewers();
    const compatible = Object.entries(viewers).filter(([id, v]) => v.exts.includes(ext));
    
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
    const viewers = getInternalViewers();
    if (viewers[appId]) {
        viewers[appId].action(file, url);
    } else if (appId === 'browser') {
        window.open(url, '_blank');
    } else if (appId === 'system') {
        await fetch(`${API_URL}/open-system`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ targetPath: file.path }) 
        });
    } else {
        alert(t('app_not_found') + appId);
    }
}

function showOpenWithModal(file, url, compatibleViewers) {
    const modal = document.getElementById('open-with-modal');
    const list = document.getElementById('app-list');
    const check = document.getElementById('always-open-check');
    const extSpan = document.getElementById('open-with-ext');
    
    modal.classList.remove('hidden');
    document.getElementById('open-with-filename').textContent = `${t('open_with')} "${file.name}"?`;
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
    compatibleViewers.forEach(([id, v]) => addOption(id, v.name, v.icon, t('bautilus')));

    // 2. Browser Tab
    addOption('browser', t('web_browser'), 'globe', t('external'));

    // 3. System Default
    addOption('system', t('system_app'), 'monitor', t('os_default'));

    // 4. Fallback: Code Editor
    if (!compatibleViewers.find(v => v[0] === 'code')) {
        addOption('code', t('text_editor'), 'file-text', t('bautilus'));
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
    list.innerHTML = `<div style="padding:20px;">${t('analyzing_zip')}</div>`;
    
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
        list.innerHTML = `<div style="color:red; padding:20px;">${t('error_zip')}: ${e.message}</div>`;
    }
}

async function performUnzip(zipPath, createFolder) {
    const btn1 = document.getElementById('btn-unzip-here');
    const btn2 = document.getElementById('btn-unzip-folder');
    const originalText1 = btn1.textContent;
    const originalText2 = btn2.textContent;
    
    btn1.disabled = true;
    btn2.disabled = true;
    btn1.textContent = t('processing');

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
            alert(`${t('error_unzip')}: ${err.error}`);
        }
    } catch (e) {
        alert(`${t('network_error')}: ${e.message}`);
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
    container.innerHTML = `<div style="color:white; padding:20px; font-family:sans-serif;">${t('loading_pdf')}</div>`;
    
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
        container.innerHTML = `<div style="color:#ff7b7b; padding:20px;">${t('error_pdf')}: ${e.message}</div>`;
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

        // Standard Places
        add(t('home'), 'user-home.svg', p.home);
        add(t('desktop'), 'user-desktop.svg', p.desktop);
        add(t('documents'), 'folder-documents.svg', p.documents);
        add(t('downloads'), 'folder-download.svg', p.downloads);
        if (p.music) add(t('music_player'), 'folder-music.svg', p.music);
        if (p.pictures) add(t('image'), 'folder-pictures.svg', p.pictures);
        if (p.videos) add(t('video'), 'folder-videos.svg', p.videos);

        // Windows Drives Section
        if (p.drives && p.drives.length > 0) {
            const driveHeader = document.createElement('div');
            driveHeader.className = 'sidebar-header';
            driveHeader.textContent = t('this_pc');
            side.appendChild(driveHeader);

            p.drives.forEach(drive => {
                const li = document.createElement('li');
                li.dataset.path = drive;
                li.innerHTML = `<img src="icons/adwaita/user-home.svg" style="filter: hue-rotate(200deg)"> <span style="flex:1">${drive}</span>`;
                li.onclick = () => navigateTo(drive);
                side.appendChild(li);
            });
        }
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
    const norm = (p) => (p || '').replace(/[\\\/]$/, '').toLowerCase();
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
