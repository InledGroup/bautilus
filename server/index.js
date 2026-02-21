const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const open = require('open');
const os = require('os');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Base path defaults to user home directory
const ROOT = os.homedir();

// Get standard system paths
app.get('/system-paths', (req, res) => {
    res.json({
        home: ROOT,
        desktop: path.join(ROOT, 'Desktop'),
        documents: path.join(ROOT, 'Documents'),
        downloads: path.join(ROOT, 'Downloads'),
        music: path.join(ROOT, 'Music'),
        pictures: path.join(ROOT, 'Pictures'),
        videos: path.join(ROOT, 'Videos')
    });
});

function getSafePath(requestPath) {
    if (!requestPath || requestPath === 'undefined') return ROOT;
    return path.resolve(requestPath);
}

// List directory contents
app.get('/files', async (req, res) => {
    try {
        const targetPath = getSafePath(req.query.path);
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
        // Direct call to 'open' command via child_process for maximum reliability on macOS
        const { exec } = require('child_process');
        exec(`open "${targetPath.replace(/"/g, '\\"')}"`, (error) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ error: error.message });
            }
            res.json({ success: true });
        });
    } catch (error) {
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

app.listen(PORT, () => {
    console.log(`Bautilus Backend running on http://localhost:${PORT}`);
    console.log(`Root access enabled at: ${ROOT}`);
});
