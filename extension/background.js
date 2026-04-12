chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('index.html')
    });
});

const EXT_NAME = 'bautilus';
const UPDATE_URL = 'https://extupdater.inled.es/api/updates.json';

async function checkUpdates() {
    try {
        // Cache busting to ensure we get the latest data
        const response = await fetch(`${UPDATE_URL}?t=${Date.now()}`);
        const updates = await response.json();
        const version = chrome.runtime.getManifest().version;
        const currentId = `${EXT_NAME}-v${version}`;
        
        console.log(`Checking updates for: ${currentId}`);
        
        const updateEntry = updates.find(u => u.id === currentId);
        
        if (updateEntry) {
            console.log('Update found:', updateEntry);
            await chrome.storage.local.set({ updateAvailable: updateEntry });
        } else {
            console.log('No update entry found for this version.');
            await chrome.storage.local.remove('updateAvailable');
        }
    } catch (error) {
        console.error('Error checking updates:', error);
    }
}

// Check every 24 hours
chrome.alarms.create('dailyUpdateCheck', { periodInMinutes: 1440 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'dailyUpdateCheck') {
        checkUpdates();
    }
});

// Initial check on startup
chrome.runtime.onStartup.addListener(checkUpdates);
chrome.runtime.onInstalled.addListener(checkUpdates);

// Progress Icon Manager
// Progress Icon Manager
let cachedIconBitmap = null;

async function updateActionIcon(activeDownloads) {
    const downloading = activeDownloads ? activeDownloads.filter(d => d.status === 'downloading') : [];
    const count = downloading.length;
    
    console.log(`[Bautilus] Actualizando icono. Descargas activas: ${count}`);

    // Create canvas for drawing (even for reset to ensure clean overwrite)
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext('2d');

    // Load base icon if not cached
    if (!cachedIconBitmap) {
        try {
            const response = await fetch(chrome.runtime.getURL('bautilus.png'));
            const blob = await response.blob();
            cachedIconBitmap = await createImageBitmap(blob);
            console.log("[Bautilus] Icono base cargado en caché.");
        } catch (e) {
            console.error("[Bautilus] Error cargando bitmap:", e);
        }
    }

    if (count === 0) {
        chrome.action.setBadgeText({ text: '' });
        
        // Clear and draw just the base logo
        ctx.clearRect(0, 0, 32, 32);
        if (cachedIconBitmap) {
            ctx.drawImage(cachedIconBitmap, 0, 0, 32, 32);
        } else {
            // Fallback if image fails
            ctx.fillStyle = '#e01b24';
            ctx.fillRect(8, 8, 16, 16);
        }
        
        const imageData = ctx.getImageData(0, 0, 32, 32);
        chrome.action.setIcon({ imageData: { "32": imageData } });
        console.log("[Bautilus] Icono reseteado a estado original.");
        return;
    }

    // Set Badge
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#e01b24' });

    // Calculate overall percentage
    let totalBytes = 0;
    let receivedBytes = 0;
    downloading.forEach(d => {
        if (d.total > 0) {
            totalBytes += d.total;
            receivedBytes += d.received;
        }
    });

    const percent = totalBytes > 0 ? receivedBytes / totalBytes : 0;
    console.log(`[Bautilus] Progreso total: ${Math.round(percent * 100)}%`);
    
    ctx.clearRect(0, 0, 32, 32);
    
    // Draw the Bautilus logo in the center (scaled down to fit ring)
    if (cachedIconBitmap) {
        ctx.drawImage(cachedIconBitmap, 6, 6, 20, 20);
    }

    // Outer circle (muted background for the ring)
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Progress arc
    ctx.beginPath();
    ctx.arc(16, 16, 14, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * percent));
    ctx.strokeStyle = '#3584e4';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    const imageData = ctx.getImageData(0, 0, 32, 32);
    chrome.action.setIcon({ imageData: { "32": imageData } });
}

async function pollDownloads() {
    chrome.storage.local.get(['serverUrl'], async (r) => {
        const apiBase = r.serverUrl || 'http://localhost:3001';
        try {
            const res = await fetch(`${apiBase}/downloads`);
            if (res.ok) {
                const downloads = await res.json();
                updateActionIcon(downloads);
            } else {
                // If response not OK, reset icon as safety measure
                updateActionIcon([]);
            }
        } catch (e) {
            // Server might be down, reset icon to avoid showing stuck progress
            updateActionIcon([]);
        }
    });
}

setInterval(pollDownloads, 2000);

let lastPickerRequestTabId = null;

// Helper to safely send message to tab with fallback to window
async function sendToTabOrOpenWindow(tabId, message, fallbackOptions) {
    console.log("[Bautilus Background] Intentando enviar mensaje a tab:", tabId, message.action);
    try {
        await chrome.tabs.sendMessage(tabId, message);
        console.log("[Bautilus Background] Mensaje enviado con éxito.");
    } catch (e) {
        console.warn("[Bautilus Background] No se pudo contactar con content script, usando popup.", e.message);
        chrome.windows.create(fallbackOptions);
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // 0. Manual Update Check
    if (msg.action === 'check_updates_manual') {
        (async () => {
            await checkUpdates();
            const r = await chrome.storage.local.get(['updateAvailable']);
            sendResponse({ updateAvailable: r.updateAvailable });
        })();
        return true; 
    }

    if (msg.action === 'close_modal') {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'close_bautilus_modal' }).catch(() => {});
            }
        });
        sendResponse({});
        return;
    }

    // 1. Upload Request from Content Script (Website wants a file)
    if (msg.action === 'open_picker') {
        lastPickerRequestTabId = sender.tab.id;
        const multiple = msg.multiple ? '1' : '0';
        const accept = msg.accept ? encodeURIComponent(msg.accept) : '';
        const pickerUrl = chrome.runtime.getURL(`index.html?mode=picker&display=modal&multiple=${multiple}&accept=${accept}`);
        sendToTabOrOpenWindow(sender.tab.id, { 
            action: 'show_bautilus_modal', 
            url: pickerUrl 
        }, {
            url: chrome.runtime.getURL(`index.html?mode=picker&multiple=${multiple}&accept=${accept}`),
            type: 'popup',
            width: 900,
            height: 600
        });
        sendResponse({});
    } 
    // 2. File Selected in Bautilus UI (Returning file to Website)
    else if (msg.action === 'file_selected_in_picker') {
        const targetTabId = lastPickerRequestTabId;
        if (!targetTabId) return sendResponse({error: "No requesting tab found"});

        const files = Array.isArray(msg.file) ? msg.file : [msg.file];
        
        const processFiles = async () => {
            const finalFiles = await Promise.all(files.map(async (f) => {
                if (f.base64) return f;
                
                try {
                    const res = await fetch(f.url);
                    const buffer = await res.arrayBuffer();
                    const bytes = new Uint8Array(buffer);
                    let binary = '';
                    const len = bytes.byteLength;
                    for (let i = 0; i < len; i++) {
                        binary += String.fromCharCode(bytes[i]);
                    }
                    return { base64: btoa(binary), name: f.name, type: f.type };
                } catch (err) {
                    console.error("Error fetching file for picker:", err);
                    return null;
                }
            }));

            const validFiles = finalFiles.filter(f => f !== null);
            if (validFiles.length > 0) {
                chrome.tabs.sendMessage(targetTabId, {
                    action: 'file_selected',
                    file: Array.isArray(msg.file) ? validFiles : validFiles[0]
                }).catch(() => {});
            }
            
            // Cerrar el modal o popup
            chrome.tabs.sendMessage(targetTabId, { action: 'close_bautilus_modal' }).catch(() => {});
            if (sender.tab && sender.tab.windowId && sender.tab.id !== targetTabId) {
                chrome.windows.remove(sender.tab.windowId).catch(() => {});
            }
        };

        processFiles();
        sendResponse({});
    }
    // 3. Save Target Selected in Bautilus UI (for Download)
    else if (msg.action === 'save_target_selected') {
        const { fileUrl, targetPath, filename } = msg;
        
        chrome.storage.local.get(['serverUrl'], async (r) => {
            const apiBase = r.serverUrl || 'http://localhost:3001';
            try {
                const res = await fetch(`${apiBase}/download-from-url`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url: fileUrl, targetPath, filename })
                });

                if (res.ok) {
                    pollDownloads();
                }
            } catch (err) { 
                console.error("Fetch error on server download:", err); 
            }

            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'close_bautilus_modal' }).catch(() => {
                        if (sender.tab && sender.tab.windowId) chrome.windows.remove(sender.tab.windowId).catch(() => {});
                    });
                } else if (sender.tab && sender.tab.windowId) {
                    chrome.windows.remove(sender.tab.windowId).catch(() => {});
                }
            });
        });
        sendResponse({});
    }
});

// Intercept Downloads
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    if (item.url.startsWith('blob:') || item.url.startsWith('data:')) return;

    const filename = item.filename;
    const url = item.url;

    // Cancelar INMEDIATAMENTE para que el sistema operativo no abra su diálogo
    chrome.downloads.cancel(item.id, () => {
        if (!chrome.runtime.lastError) {
            chrome.downloads.erase({id: item.id}, () => {
                if (chrome.runtime.lastError) { /* ignore */ }
            });
        }
    });

    // Abrir nuestra UI modal
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
            const modalUrl = chrome.runtime.getURL(`index.html?mode=save&display=modal&filename=${encodeURIComponent(filename)}&url=${encodeURIComponent(url)}`);
            const windowUrl = chrome.runtime.getURL(`index.html?mode=save&filename=${encodeURIComponent(filename)}&url=${encodeURIComponent(url)}`);
            
            sendToTabOrOpenWindow(tabs[0].id, { 
                action: 'show_bautilus_modal', 
                url: modalUrl 
            }, {
                url: windowUrl,
                type: 'popup',
                width: 900,
                height: 600
            });
        }
    });
});
