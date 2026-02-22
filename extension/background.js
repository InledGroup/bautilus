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
        
        // Send request to local server to download the file
        // We use the server to bypass browser download folder restrictions
        fetch('http://localhost:3001/download-from-url', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ url: fileUrl, targetPath, filename })
        }).then(res => {
            if (res.ok) {
                chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'bautilus.png',
                    title: chrome.i18n.getMessage("downloadCompleted"),
                    message: `${chrome.i18n.getMessage("savedIn")} ${targetPath}`
                });
            } else {
                console.error("Download failed on server");
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

    // Cancel the default browser download
    chrome.downloads.cancel(item.id, () => {
        if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
        // Erase from history to avoid "Canceled" entry clutter
        chrome.downloads.erase({id: item.id});
    });

    // Open Bautilus Save UI
    const filename = item.filename; // Suggested filename
    const url = item.url;
    
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
