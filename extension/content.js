let activeInput = null;

// Listen for clicks on file inputs
document.addEventListener('click', (event) => {
    const target = event.target;
    if (target.tagName === 'INPUT' && target.type === 'file') {
        // Prevent the native file picker
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        
        activeInput = target;
        
        // Ask background to open Bautilus picker
        chrome.runtime.sendMessage({ action: 'open_picker' });
    }
}, true); // Capture phase

// Listen for the file selection from the popup via background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'file_selected' && activeInput) {
        console.log("Bautilus: File received from background", message.file.name);
        handleFileSelection(activeInput, message.file);
        activeInput = null; // Reset
    }
});

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
        inputElement.files = dataTransfer.files;

        // Dispatch events so the website reacts
        inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        
        console.log("Bautilus: Successfully populated input with", file.name);
        
    } catch (error) {
        console.error('Bautilus: Error injecting file into input:', error);
    }
}
