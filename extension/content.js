let activeInput = null;

// Listen for clicks on file inputs
document.addEventListener('click', (event) => {
    // Evitar interceptar en páginas de Bautilus (local o servidor)
    if (document.getElementById('file-view') || 
        window.location.protocol === 'chrome-extension:' ||
        document.body.classList.contains('bautilus-page')) {
        return;
    }

    const target = event.target;
    // Interceptar clicks en el input file o en labels asociados
    let fileInput = null;
    if (target.tagName === 'INPUT' && target.type === 'file') {
        fileInput = target;
    } else if (target.tagName === 'LABEL' && target.htmlFor) {
        fileInput = document.getElementById(target.htmlFor);
    } else {
        // Buscar si el click fue dentro de un label que contiene un input file
        fileInput = target.closest('label')?.querySelector('input[type="file"]');
    }

    if (fileInput && fileInput.type === 'file') {
        // Evitar el selector nativo
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        activeInput = fileInput;
        console.log("[Bautilus] Interceptado selector de archivos para:", activeInput);
        
        chrome.runtime.sendMessage({ action: 'open_picker' }, () => {
            if (chrome.runtime.lastError) console.warn("[Bautilus] Background not ready:", chrome.runtime.lastError.message);
        });
    }
}, true); // Fase de captura para llegar antes que los scripts de la web

// Listen for the file selection from the popup via background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("[Bautilus Content] Mensaje recibido:", message.action);
    if (message.action === 'show_bautilus_modal') {
        console.log("[Bautilus Content] Mostrando modal:", message.url);
        showBautilusModal(message.url);
        sendResponse({success: true});
    } else if (message.action === 'close_bautilus_modal') {
        console.log("[Bautilus Content] Cerrando modal");
        hideBautilusModal();
        sendResponse({success: true});
    } else if (message.action === 'file_selected' && activeInput) {
        console.log("Bautilus: File received from background", message.file.name);
        handleFileSelection(activeInput, message.file);
        activeInput = null; // Reset
        sendResponse({success: true});
    }
    return true; // Keep channel open for async if needed
});

function showBautilusModal(url) {
    if (document.getElementById('bautilus-overlay')) {
        console.warn("[Bautilus Content] El modal ya existe.");
        return;
    }

    console.log("[Bautilus Content] Creando elementos del modal...");
    const overlay = document.createElement('div');
    overlay.id = 'bautilus-overlay';
    overlay.className = 'bautilus-overlay-root';
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

    console.log("[Bautilus Content] Modal inyectado en el DOM.");

    // Animate in
    setTimeout(() => {
        overlay.style.opacity = '1';
        container.style.transform = 'scale(1)';
        console.log("[Bautilus Content] Animación de entrada iniciada.");
    }, 10);
}

function hideBautilusModal() {
    const overlay = document.getElementById('bautilus-overlay');
    if (!overlay) return;

    overlay.style.opacity = '0';
    overlay.querySelector('div').style.transform = 'scale(0.95)';

    setTimeout(() => {
        overlay.remove();
    }, 300);
}

function handleFileSelection(inputElement, fileData) {
    try {
        // Decode Base64 to Blob
        const byteCharacters = atob(fileData.base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: fileData.type || 'application/octet-stream' });
        
        // Create a File object
        const file = new File([blob], fileData.name, {
            type: blob.type,
            lastModified: new Date().getTime()
        });

        // Use DataTransfer to simulate file selection
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        
        // IMPORTANT: Some frameworks check for the 'files' property being updated.
        // We set it directly.
        inputElement.files = dataTransfer.files;

        // Dispatch multiple events to ensure the website reacts.
        // Some use 'change', some 'input', some even 'click' or 'blur'.
        const events = ['input', 'change'];
        events.forEach(eventName => {
            const event = new Event(eventName, { bubbles: true, cancelable: true });
            // For React and other frameworks that might override the value setter
            inputElement.dispatchEvent(event);
        });
        
        // Trigger a 'change' event specifically for file inputs
        const changeEvent = new Event('change', { bubbles: true });
        Object.defineProperty(changeEvent, 'target', {writable: false, value: inputElement});
        inputElement.dispatchEvent(changeEvent);

        console.log("Bautilus: Successfully populated input with", file.name);
        
    } catch (error) {
        console.error('Bautilus: Error injecting file into input:', error);
    }
}
