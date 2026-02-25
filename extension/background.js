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
    const downloading = activeDownloads.filter(d => d.status === 'downloading');
    const count = downloading.length;

    if (count === 0) {
        chrome.action.setBadgeText({ text: '' });
        chrome.action.setIcon({ path: {
            "16": "bautilus.png",
            "48": "bautilus.png",
            "128": "bautilus.png"
        }});
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
    
    // Draw progress circle on icon
    const canvas = new OffscreenCanvas(32, 32);
    const ctx = canvas.getContext('2d');

    // Load base icon if not cached
    if (!cachedIconBitmap) {
        try {
            const response = await fetch(chrome.runtime.getURL('bautilus.png'));
            const blob = await response.blob();
            cachedIconBitmap = await createImageBitmap(blob);
        } catch (e) {
            console.error("Error loading icon bitmap:", e);
        }
    }

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
            }
        } catch (e) {
            // Server might be down, ignore
        }
    });
}

setInterval(pollDownloads, 2000);

let pickerRequestTabId = null;

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

    // 1. Upload Request from Content Script
    if (msg.action === 'open_picker') {
        pickerRequestTabId = sender.tab.id;
        chrome.windows.create({
            url: chrome.runtime.getURL('index.html?mode=picker'),
            type: 'popup',
            width: 900,
            height: 600
        });
    } 
    // 2. File Selected in Bautilus UI (for Upload)
    else if (msg.action === 'file_selected_in_picker') {
        if (pickerRequestTabId) {
            const { url, name, type } = msg.file;
            const targetTabId = parseInt(pickerRequestTabId);
            
            fetch(url)
                .then(res => res.arrayBuffer())
                .then(buffer => {
                    // Convert ArrayBuffer to Base64 (Safer for Chrome messaging)
                    const base64 = btoa(
                        new Uint8Array(buffer)
                            .reduce((data, byte) => data + String.fromCharCode(byte), '')
                    );
                    
                    chrome.tabs.sendMessage(targetTabId, {
                        action: 'file_selected',
                        file: {
                            base64: base64,
                            name: name,
                            type: type
                        }
                    });
                })
                .catch(err => console.error("Error fetching file for picker:", err));

            pickerRequestTabId = null;
            if (sender.tab && sender.tab.windowId) {
                chrome.windows.remove(sender.tab.windowId);
            }
        }
    }
    // 3. Save Target Selected in Bautilus UI (for Download)
    else if (msg.action === 'save_target_selected') {
        const { fileUrl, targetPath, filename } = msg;
        
        chrome.storage.local.get(['serverUrl'], async (r) => {
            const apiBase = r.serverUrl || 'http://localhost:3001';
            
            try {
                // Send request to local server to download the file
                const res = await fetch(`${apiBase}/download-from-url`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ url: fileUrl, targetPath, filename })
                });

                if (res.ok) {
                    const data = await res.json();
                    console.log("Download started on server:", data.downloadId);
                    // Start polling progress immediately to update UI
                    pollDownloads();
                } else {
                    console.error("Download failed on server");
                }
            } catch (err) {
                console.error("Fetch error on server download:", err);
            }
        });

        // Close the popup window
        if (sender.tab && sender.tab.windowId) {
            chrome.windows.remove(sender.tab.windowId);
        }
    }
});

// Intercept Downloads
chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
    // Skip if it looks like a blob (often internal) or if user disabled interception
    // For now, intercept everything except blobs to be safe?
    if (item.url.startsWith('blob:') || item.url.startsWith('data:')) {
        // Blobs are hard to pass to server via URL. 
        // We let the browser handle them naturally or implemented complex blob extraction.
        return; // Let browser handle it
    }

    // Capture suggested filename
    const filename = item.filename;
    const url = item.url;

    // Delay cancellation slightly to avoid "Download must be in progress" errors
    // and ensure the download is actually registered.
    setTimeout(() => {
        chrome.downloads.cancel(item.id, () => {
            if (chrome.runtime.lastError) {
                // Ignore if it was already handled or not yet in progress
                console.warn('Cancel error:', chrome.runtime.lastError.message);
            }
            // Erase from history to avoid "Canceled" entry clutter
            chrome.downloads.erase({id: item.id});
        });
    }, 100); // Small delay to let browser stabilize

    // Open Bautilus Save UI
    // Pass info to the popup via URL params
    const winUrl = `index.html?mode=save&filename=${encodeURIComponent(filename)}&url=${encodeURIComponent(url)}`;
    
    chrome.windows.create({
        url: chrome.runtime.getURL(winUrl),
        type: 'popup',
        width: 900,
        height: 600
    });
    
    // We must return true if we call suggest asynchronously, but here we cancel immediately.
    // So we don't call suggest.
});
