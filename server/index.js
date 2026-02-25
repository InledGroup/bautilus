const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const open = require('open');
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

    async function loadDownloads() {
        try {
            if (await fs.pathExists(DOWNLOADS_FILE)) {
                activeDownloads = await fs.readJson(DOWNLOADS_FILE);
                // Reset status of "downloading" items to "interrupted" or "unknown" on restart
                for (const id in activeDownloads) {
                    if (activeDownloads[id].status === 'downloading') {
                        activeDownloads[id].status = 'error';
                        activeDownloads[id].error = 'Server restarted';
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

    app.get('/downloads', (req, res) => {
        res.json(Object.values(activeDownloads));
    });

    app.post('/clear-downloads', async (req, res) => {
        // Clear only completed or error downloads
        for (const id in activeDownloads) {
            if (activeDownloads[id].status !== 'downloading') {
                delete activeDownloads[id];
            }
        }
        await saveDownloads();
        res.json({ success: true });
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

    // Download from URL to local path
    app.post('/download-from-url', async (req, res) => {
        const downloadId = Date.now().toString();
        try {
            const { url, targetPath, filename } = req.body;
            if (!url || !targetPath || !filename) {
                return res.status(400).json({ error: 'Missing parameters' });
            }
            
            // Sanitize filename to prevent directory traversal or invalid chars
            const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
            const saveDir = getSafePath(targetPath);
            const fullPath = path.join(saveDir, safeFilename);
            const partPath = fullPath + '.bautilus-part';
            
            console.log(`Downloading ${url} -> ${fullPath}`);
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
            }
            
            if (!response.body) {
                throw new Error("No response body");
            }

            const totalBytes = parseInt(response.headers.get('content-length') || '0');
            activeDownloads[downloadId] = {
                id: downloadId,
                filename: safeFilename,
                path: fullPath,
                total: totalBytes,
                received: 0,
                status: 'downloading',
                startTime: Date.now()
            };
            await saveDownloads();
            
            const fileStream = fs.createWriteStream(partPath);
            
            res.json({ success: true, downloadId });

            // Using Readable.from(response.body) for cross-compatibility between Node versions
            const bodyStream = response.body.getReader ? Readable.fromWeb(response.body) : response.body;

            (async () => {
                try {
                    let lastSave = Date.now();
                    for await (const chunk of bodyStream) {
                        activeDownloads[downloadId].received += chunk.length;
                        fileStream.write(chunk);
                        
                        // Periodic save every 2s during download
                        if (Date.now() - lastSave > 2000) {
                            await saveDownloads();
                            lastSave = Date.now();
                        }
                    }
                    fileStream.end();
                    
                    // Rename .part to final filename
                    await fs.move(partPath, fullPath, { overwrite: true });
                    
                    activeDownloads[downloadId].status = 'completed';
                    console.log(`Download complete: ${safeFilename}`);
                    
                    await saveDownloads();
                } catch (err) {
                    console.error("Stream error:", err);
                    if (activeDownloads[downloadId]) {
                        activeDownloads[downloadId].status = 'error';
                        activeDownloads[downloadId].error = err.message;
                    }
                    fileStream.end();
                    // Cleanup partial file
                    if (await fs.pathExists(partPath)) await fs.remove(partPath);
                    await saveDownloads();
                }
            })();
            
        } catch (error) {
            console.error("Download error:", error);
            res.status(500).json({ error: error.message });
        }
    });
    app.listen(PORT, INTERFACE, () => {
        const url = `http://${INTERFACE === '0.0.0.0' ? 'localhost' : INTERFACE}:${PORT}`;
        console.log(`Bautilus Backend running on ${url}`);
        console.log(`Root access enabled at: ${ROOT}`);
        
        if (needsConfig) {
            console.log('No configuration found. Opening visual configurator...');
            open(`${url}/index.html?setup=1`);
        }
    });
}

initServer();
