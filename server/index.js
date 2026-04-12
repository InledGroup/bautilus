const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const open = async (...args) => {
    try {
        const { default: openApp } = await import('open');
        return await openApp(...args);
    } catch (err) {
        console.error('Error importing or running open:', err);
    }
};
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

// Ensure fetch is available (Node 18+) or polyfill
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

const app = express();

const CONFIG_DIR = path.join(os.homedir(), '.bautilus');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default values
let PORT = 3001;
let INTERFACE = 'localhost';

async function loadConfig() {
    try {
        if (await fs.pathExists(CONFIG_FILE)) {
            const config = await fs.readJson(CONFIG_FILE);
            if (config.port) PORT = config.port;
            if (config.interface) INTERFACE = config.interface;
            return config;
        }
    } catch (err) {
        console.error('Error loading config:', err);
    }
    return null;
}

async function saveConfig(config) {
    try {
        await fs.ensureDir(CONFIG_DIR);
        await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
    } catch (err) {
        console.error('Error saving config:', err);
    }
}

// Windows Drive Detection Helper
async function getWindowsDrives() {
    if (os.platform() !== 'win32') return [];
    try {
        // We use powershell as it is more modern than wmic
        const { stdout } = await execPromise('powershell "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"');
        return stdout.split(/\r?\n/).filter(l => l.trim() !== '').map(l => l.trim());
    } catch (e) {
        console.error('Error detecting drives:', e);
        return ['C:\\']; // Safe fallback
    }
}

// Localized Path Helper
async function findLocalizedPath(root, standardName) {
    const commonLocalizedNames = {
        'Desktop': ['Escritorio', 'Bureau', 'Schreibtisch'],
        'Documents': ['Documentos', 'Documents', 'Dokumente'],
        'Downloads': ['Descargas', 'Téléchargements', 'Downloads'],
        'Music': ['Música', 'Musique', 'Musik'],
        'Pictures': ['Imágenes', 'Images', 'Bilder'],
        'Videos': ['Vídeos', 'Vidéos', 'Videos']
    };

    const target = path.join(root, standardName);
    if (await fs.pathExists(target)) return target;

    // Search for localized versions
    const candidates = commonLocalizedNames[standardName] || [];
    for (const name of candidates) {
        const locTarget = path.join(root, name);
        if (await fs.pathExists(locTarget)) return locTarget;
    }
    
    return target; // Return standard even if not found
}

// Parse arguments
const args = process.argv.slice(2);
const getArgValue = (flag) => {
    const arg = args.find(a => a.startsWith(flag));
    return arg ? arg.split(':')[1] : null;
};

async function initServer() {
    const config = await loadConfig();
    
    const argPort = getArgValue('--port');
    const argInterface = getArgValue('--interface');

    let needsConfig = !config && !argPort && !argInterface;

    if (argPort) PORT = parseInt(argPort);
    if (argInterface) INTERFACE = argInterface;

    // If flags provided, save them
    if (argPort || argInterface) {
        await saveConfig({ port: PORT, interface: INTERFACE });
    }

    app.use(cors());
    app.use(express.json());

    // Serve extension folder as static files
    app.use(express.static(path.join(__dirname, '../extension')));

    // Base path defaults to user home directory
    const ROOT = os.homedir();

    const CONFIG_DIR = path.join(os.homedir(), '.bautilus');
    const DOWNLOADS_FILE = path.join(CONFIG_DIR, 'downloads.json');

    let activeDownloads = {};
    let downloadAborts = {}; // { downloadId: AbortController }

    async function loadDownloads() {
        try {
            if (await fs.pathExists(DOWNLOADS_FILE)) {
                activeDownloads = await fs.readJson(DOWNLOADS_FILE);
                // Reset status of "downloading" items to "paused" on restart so they can be resumed
                for (const id in activeDownloads) {
                    if (activeDownloads[id].status === 'downloading') {
                        activeDownloads[id].status = 'paused';
                    }
                }
            }
        } catch (err) { console.error('Error loading downloads:', err); }
    }

    async function saveDownloads() {
        try {
            await fs.ensureDir(CONFIG_DIR);
            // Only save a limited history (e.g. last 50 downloads)
            const history = Object.entries(activeDownloads)
                .sort((a,b) => b[1].startTime - a[1].startTime)
                .slice(0, 50);
            await fs.writeJson(DOWNLOADS_FILE, Object.fromEntries(history), { spaces: 2 });
        } catch (err) { console.error('Error saving downloads:', err); }
    }

    await loadDownloads();

    // Common function to perform/resume a download
    async function performDownload(downloadId) {
        if (!activeDownloads[downloadId]) return;
        
        const d = activeDownloads[downloadId];
        const partPath = d.path + '.bautilus-part';
        
        // If already downloading, don't start another
        if (d.status === 'downloading' && downloadAborts[downloadId]) return;

        const controller = new AbortController();
        downloadAborts[downloadId] = controller;
        d.status = 'downloading';
        d.error = null;
        await saveDownloads();

        try {
            const startByte = d.received || 0;
            const headers = {};
            if (startByte > 0) {
                headers['Range'] = `bytes=${startByte}-`;
            }

            const response = await fetch(d.url, { 
                headers,
                signal: controller.signal 
            });

            if (!response.ok && response.status !== 206) {
                throw new Error(`Failed to fetch ${d.url}: ${response.statusText} (${response.status})`);
            }

            if (!response.body) {
                throw new Error("No response body");
            }

            // If server doesn't support range and we asked for it, it might return 200 instead of 206
            // In that case, we must restart from 0
            let actualFileStream;
            if (response.status === 200 && startByte > 0) {
                console.log(`Server does not support Range for ${d.url}. Restarting download from 0.`);
                d.received = 0;
                actualFileStream = fs.createWriteStream(partPath);
            } else {
                actualFileStream = fs.createWriteStream(partPath, { flags: 'a' });
            }

            const bodyStream = response.body.getReader ? Readable.fromWeb(response.body) : response.body;

            try {
                let lastSave = Date.now();
                for await (const chunk of bodyStream) {
                    d.received += chunk.length;
                    actualFileStream.write(chunk);
                    
                    if (Date.now() - lastSave > 2000) {
                        await saveDownloads();
                        lastSave = Date.now();
                    }
                }
                
                actualFileStream.end();
                
                if (d.status === 'downloading') {
                    d.status = 'completed';
                    if (d.total > 0) d.received = d.total;
                    
                    if (await fs.pathExists(partPath)) {
                        await fs.move(partPath, d.path, { overwrite: true });
                    }
                    console.log(`Download complete: ${d.filename}`);
                }
            } finally {
                actualFileStream.end();
                delete downloadAborts[downloadId];
                await saveDownloads();
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`Download ${downloadId} paused/aborted.`);
                d.status = 'paused';
            } else {
                console.error("Stream error:", err);
                d.status = 'error';
                d.error = err.message;
            }
            delete downloadAborts[downloadId];
            await saveDownloads();
        }
    }

    app.get('/downloads', (req, res) => {
        res.json(Object.values(activeDownloads));
    });

    app.post('/clear-downloads', async (req, res) => {
        for (const id in activeDownloads) {
            if (activeDownloads[id].status !== 'downloading') {
                delete activeDownloads[id];
            }
        }
        await saveDownloads();
        res.json({ success: true });
    });

    app.post('/pause-download', async (req, res) => {
        const { id } = req.body;
        if (downloadAborts[id]) {
            downloadAborts[id].abort();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not active or already paused' });
        }
    });

    app.post('/resume-download', async (req, res) => {
        const { id } = req.body;
        if (activeDownloads[id] && activeDownloads[id].status !== 'downloading') {
            performDownload(id);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not found or already active' });
        }
    });

    app.post('/delete-download', async (req, res) => {
        const { id } = req.body;
        const d = activeDownloads[id];
        if (d) {
            if (downloadAborts[id]) {
                downloadAborts[id].abort();
            }
            
            const partPath = d.path + '.bautilus-part';
            try {
                if (await fs.pathExists(d.path)) await fs.remove(d.path);
                if (await fs.pathExists(partPath)) await fs.remove(partPath);
            } catch (e) {}
            
            delete activeDownloads[id];
            await saveDownloads();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not found' });
        }
    });

    // Config endpoints
    app.get('/get-config', (req, res) => {
        res.json({ port: PORT, interface: INTERFACE, needsConfig });
    });

    app.post('/set-config', async (req, res) => {
        try {
            const { port, interface: newInterface } = req.body;
            if (port) PORT = parseInt(port);
            if (newInterface) INTERFACE = newInterface;
            await saveConfig({ port: PORT, interface: INTERFACE });
            res.json({ success: true });
            
            // Note: In a real world, changing port would require a restart.
            // For now, we just save it. The user will have to restart the server.
            console.log(`Config updated: ${INTERFACE}:${PORT}. Restart recommended.`);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Get standard system paths
app.get('/system-paths', async (req, res) => {
    const drives = await getWindowsDrives();
    res.json({
        home: ROOT,
        desktop: await findLocalizedPath(ROOT, 'Desktop'),
        documents: await findLocalizedPath(ROOT, 'Documents'),
        downloads: await findLocalizedPath(ROOT, 'Downloads'),
        music: await findLocalizedPath(ROOT, 'Music'),
        pictures: await findLocalizedPath(ROOT, 'Pictures'),
        videos: await findLocalizedPath(ROOT, 'Videos'),
        drives: drives
    });
});

app.get('/drives', async (req, res) => {
    const drives = await getWindowsDrives();
    res.json(drives);
});

function getSafePath(requestPath) {
    if (!requestPath || requestPath === 'undefined') return ROOT;
    return path.resolve(requestPath);
}

// List directory contents
app.get('/files', async (req, res) => {
    try {
        let targetPath = req.query.path;
        
        // Handle root of all drives in Windows if path is empty or "root"
        if (os.platform() === 'win32' && (!targetPath || targetPath === 'root')) {
            const drives = await getWindowsDrives();
            return res.json({
                currentPath: 'root',
                parentPath: null,
                files: drives.map(d => ({
                    name: d,
                    path: d,
                    isDirectory: true,
                    size: 0,
                    mtime: new Date(),
                    ext: ''
                }))
            });
        }

        targetPath = getSafePath(targetPath);
        const stats = await fs.stat(targetPath);
        
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: 'Path is not a directory' });
        }

        const entries = await fs.readdir(targetPath);
        const result = await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(targetPath, entry);
            try {
                const entryStats = await fs.stat(fullPath);
                return {
                    name: entry,
                    path: fullPath,
                    isDirectory: entryStats.isDirectory(),
                    size: entryStats.size,
                    mtime: entryStats.mtime,
                    ext: path.extname(entry).toLowerCase()
                };
            } catch (err) {
                return null; // Skip inaccessible files
            }
        }));

        res.json({
            currentPath: targetPath,
            parentPath: path.dirname(targetPath),
            files: result.filter(f => f !== null)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Recursive search with streaming (SSE)
app.get('/search', async (req, res) => {
    const { query, rootPath } = req.query;
    if (!query) return res.json([]);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendMatch = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const startPath = getSafePath(rootPath);
    let count = 0;
    const maxResults = 1000;

    const searchInternal = async (dir) => {
        if (count >= maxResults) return;
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (count >= maxResults) break;
                
                const fullPath = path.join(dir, entry.name);
                if (entry.name.toLowerCase().includes(query.toLowerCase())) {
                    try {
                        const stats = await fs.stat(fullPath);
                        sendMatch({
                            name: entry.name,
                            path: fullPath,
                            isDirectory: entry.isDirectory(),
                            size: stats.size,
                            mtime: stats.mtime,
                            ext: path.extname(entry.name).toLowerCase()
                        });
                        count++;
                    } catch (e) { /* ignore inaccessible */ }
                }
                
                if (entry.isDirectory()) {
                    await searchInternal(fullPath);
                }
            }
        } catch (e) { /* ignore restricted dirs */ }
    };

    await searchInternal(startPath);
    res.write('event: end\ndata: done\n\n');
    res.end();
});

// Create folder
app.post('/create-folder', async (req, res) => {
    try {
        const { parentPath, name } = req.body;
        const target = path.join(getSafePath(parentPath), name);
        await fs.ensureDir(target);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Rename or Move
app.post('/rename', async (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        await fs.move(oldPath, newPath, { overwrite: false });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Copy
app.post('/copy', async (req, res) => {
    try {
        const { source, destination } = req.body;
        await fs.copy(source, destination);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
app.post('/delete', async (req, res) => {
    try {
        const { targetPath } = req.body;
        await fs.remove(targetPath);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Compress
app.post('/compress', async (req, res) => {
    try {
        const { sourcePaths, destinationZip } = req.body;
        const output = fs.createWriteStream(destinationZip);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => res.json({ success: true }));
        archive.on('error', (err) => res.status(500).json({ error: err.message }));

        archive.pipe(output);
        for (const src of sourcePaths) {
            const stats = await fs.stat(src);
            if (stats.isDirectory()) {
                archive.directory(src, path.basename(src));
            } else {
                archive.file(src, { name: path.basename(src) });
            }
        }
        archive.finalize();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Open with system app (Default)
app.post('/open-system', async (req, res) => {
    try {
        const { targetPath } = req.body;
        // Use the 'open' library which is cross-platform (macOS, Windows, Linux)
        await open(targetPath);
        res.json({ success: true });
    } catch (error) {
        console.error(`Open error: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

// Serve file (for browser preview)
app.get('/view', (req, res) => {
    const filePath = getSafePath(req.query.path);
    res.sendFile(filePath);
});

// Unzip
app.post('/unzip', async (req, res) => {
    try {
        const { zipPath, createFolder } = req.body;
        const targetPath = path.dirname(zipPath);
        const zipName = path.basename(zipPath, '.zip');
        const extractTo = createFolder ? path.join(targetPath, zipName) : targetPath;

        if (createFolder) await fs.ensureDir(extractTo);
        
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(extractTo, true);
        
        res.json({ success: true, extractedTo: extractTo });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Save file content
app.post('/save', async (req, res) => {
    try {
        const { targetPath, content } = req.body;
        await fs.writeFile(getSafePath(targetPath), content, 'utf8');
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Multipart Upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const target = getSafePath(req.query.path);
        cb(null, target);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage });

app.post('/upload', upload.array('files'), (req, res) => {
    try {
        res.json({ success: true, files: req.files });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

    // Download from URL to local path
    app.post('/download-from-url', async (req, res) => {
        const downloadId = Date.now().toString();
        try {
            const { url, targetPath, filename } = req.body;
            if (!url || !targetPath || !filename) {
                return res.status(400).json({ error: 'Missing parameters' });
            }
            
            const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
            const saveDir = getSafePath(targetPath);
            const fullPath = path.join(saveDir, safeFilename);
            
            console.log(`Downloading ${url} -> ${fullPath}`);
            
            // First check URL to get total size if possible
            let totalBytes = 0;
            try {
                const head = await fetch(url, { method: 'HEAD' });
                totalBytes = parseInt(head.headers.get('content-length') || '0');
            } catch (e) {}

            activeDownloads[downloadId] = {
                id: downloadId,
                url: url,
                filename: safeFilename,
                path: fullPath,
                total: totalBytes,
                received: 0,
                status: 'downloading',
                startTime: Date.now()
            };
            
            performDownload(downloadId); // Start the process in background
            
            res.json({ success: true, downloadId });
        } catch (error) {
            console.error("Download start error:", error);
            res.status(500).json({ error: error.message });
        }
    });
    app.listen(PORT, INTERFACE, () => {
        const url = `http://${INTERFACE === '0.0.0.0' ? 'localhost' : INTERFACE}:${PORT}`;
        console.log(`Bautilus Backend running on ${url}`);
        console.log(`Root access enabled at: ${ROOT}`);
        
        if (needsConfig) {
            console.log('No configuration found. Opening visual configurator...');
            console.log(`If it doesn't open automatically, please click or visit: ${url}/index.html?setup=1`);
            open(`${url}/index.html?setup=1`);
        }
    });
}

initServer();
