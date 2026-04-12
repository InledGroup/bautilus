let activeInput = null;

// Inject a script to intercept programmatic .click() on file inputs
// and ALSO to prevent any click from reaching the original element if we don't want it to.
function injectScript() {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            // 1. Intercept programmatic .click()
            const originalClick = HTMLInputElement.prototype.click;
            HTMLInputElement.prototype.click = function() {
                if (this.type === 'file' && !this.dataset.bautilusBypass) {
                    console.log("[Bautilus] Programmatic click intercepted");
                    const event = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    this.dispatchEvent(event);
                    return;
                }
                return originalClick.apply(this, arguments);
            };

            // 2. Intercept and kill any attempt to open the file picker via the prototype's internal methods
            // Some browsers open it even if click is prevented if it was "user initiated"
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
}
injectScript();

function handleInterception(event) {
    // Evitar interceptar en páginas de Bautilus (local o servidor)
    if (document.getElementById('file-view') || 
        window.location.protocol === 'chrome-extension:' ||
        document.body.classList.contains('bautilus-page')) {
        return;
    }

    const target = event.composedPath()[0]; // Support Shadow DOM
    
    // Interceptar clicks en el input file o en labels asociados
    let fileInput = null;
    if (target.tagName === 'INPUT' && target.type === 'file') {
        fileInput = target;
    } else if (target.tagName === 'LABEL' && target.htmlFor) {
        fileInput = document.getElementById(target.htmlFor);
    } else {
        fileInput = target.closest('label')?.querySelector('input[type="file"]');
    }

    if (fileInput && fileInput.type === 'file') {
        // MUY IMPORTANTE: Prevenir el comportamiento por defecto INMEDIATAMENTE
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        // Si ya estamos abriendo uno, no abrir otro
        if (activeInput === fileInput && document.getElementById('bautilus-overlay')) return;

        activeInput = fileInput;
        console.log("[Bautilus] Interceptada acción de archivos para:", activeInput);
        
        chrome.runtime.sendMessage({ 
            action: 'open_picker',
            multiple: activeInput.multiple,
            accept: activeInput.accept
        }, () => {
            if (chrome.runtime.lastError) console.warn("[Bautilus] Background not ready:", chrome.runtime.lastError.message);
        });
        
        return false;
    }
}

// Usamos una combinación de eventos para asegurar la captura antes de que el navegador abra el diálogo
// 'click' es el estándar, pero 'pointerdown' ocurre antes y nos permite preparar la cancelación.
document.addEventListener('click', handleInterception, { capture: true, passive: false });
document.addEventListener('mousedown', handleInterception, { capture: true, passive: false });

// Interceptar Drag & Drop
document.addEventListener('dragover', (event) => {
    if (event.dataTransfer.types.includes('Files')) {
        // event.preventDefault(); // Opcional: interceptar drops globales
    }
}, true);

document.addEventListener('drop', (event) => {
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
        // Futura mejora: permitir soltar archivos directamente en la página para subirlos vía Bautilus
    }
}, true);

// Listen for the file selection from the popup via background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'show_bautilus_modal') {
        showBautilusModal(message.url);
        sendResponse({success: true});
    } else if (message.action === 'close_bautilus_modal') {
        hideBautilusModal();
        sendResponse({success: true});
    } else if (message.action === 'file_selected' && activeInput) {
        handleFileSelection(activeInput, message.file);
        activeInput = null;
        sendResponse({success: true});
    }
    return true;
});

function showBautilusModal(url) {
    if (document.getElementById('bautilus-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'bautilus-overlay';
    overlay.style.cssText = `
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.4) !important;
        backdrop-filter: blur(4px) !important;
        -webkit-backdrop-filter: blur(4px) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        opacity: 0 !important;
        transition: opacity 0.3s ease !important;
        pointer-events: auto !important;
    `;

    const container = document.createElement('div');
    container.style.cssText = `
        width: 900px !important;
        height: 600px !important;
        max-width: 95vw !important;
        max-height: 90vh !important;
        background: #1e1e1e !important;
        border-radius: 12px !important;
        overflow: hidden !important;
        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5) !important;
        transform: scale(0.95) !important;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        display: flex !important;
    `;

    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.cssText = `
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        flex: 1 !important;
    `;

    container.appendChild(iframe);
    overlay.appendChild(container);
    (document.body || document.documentElement).appendChild(overlay);

    setTimeout(() => {
        overlay.style.opacity = '1';
        container.style.transform = 'scale(1)';
    }, 10);
}

function hideBautilusModal() {
    const overlay = document.getElementById('bautilus-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    overlay.querySelector('div').style.transform = 'scale(0.95)';
    setTimeout(() => overlay.remove(), 300);
}

function handleFileSelection(inputElement, fileDataOrArray) {
    try {
        const fileDataArray = Array.isArray(fileDataOrArray) ? fileDataOrArray : [fileDataOrArray];
        const dataTransfer = new DataTransfer();

        fileDataArray.forEach(fileData => {
            const byteCharacters = atob(fileData.base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: fileData.type || 'application/octet-stream' });
            const file = new File([blob], fileData.name, {
                type: blob.type,
                lastModified: new Date().getTime()
            });
            dataTransfer.items.add(file);
        });
        
        inputElement.files = dataTransfer.files;

        ['input', 'change'].forEach(eventName => {
            const event = new Event(eventName, { bubbles: true, cancelable: true });
            inputElement.dispatchEvent(event);
        });
        
        const changeEvent = new Event('change', { bubbles: true });
        Object.defineProperty(changeEvent, 'target', {writable: false, value: inputElement});
        inputElement.dispatchEvent(changeEvent);
        
        console.log("Bautilus: Inyectados", fileDataArray.length, "archivos");
    } catch (error) {
        console.error('Bautilus: Error inyectando archivos:', error);
    }
}
