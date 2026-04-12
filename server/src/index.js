const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs-extra');
const multer = require('multer');
const archiver = require('archiver');
const AdmZip = require('adm-zip');

// Ensure fetch is available (Node 18+) or polyfill
if (typeof fetch === 'undefined') {
    global.fetch = require('node-fetch');
}

// Repositories
const NodeFileRepository = require('./infrastructure/repositories/NodeFileRepository');
const FileDownloadRepository = require('./infrastructure/repositories/FileDownloadRepository');

// Domain
const Download = require('./domain/Download');

// Use Cases
const ListFilesUseCase = require('./application/ListFilesUseCase');
// (Add more use cases here)

// Controllers
const ExpressFileController = require('./infrastructure/controllers/ExpressFileController');

async function startServer() {
    const app = express();
    const PORT = 3001;
    const INTERFACE = 'localhost';
    const ROOT = os.homedir();

    const fileRepo = new NodeFileRepository(ROOT);
    const downloadRepo = new FileDownloadRepository();

    const listFilesUseCase = new ListFilesUseCase(fileRepo);
    const fileController = new ExpressFileController(listFilesUseCase);

    app.use(cors());
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../extension')));

    // --- File Routes ---
    app.get('/files', (req, res) => fileController.list(req, res));
    
    app.get('/view', (req, res) => {
        const filePath = fileRepo.getSafePath(req.query.path);
        res.sendFile(filePath);
    });

    // Multipart Upload
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, fileRepo.getSafePath(req.query.path));
        },
        filename: (req, file, cb) => {
            cb(null, file.originalname);
        }
    });
    const upload = multer({ storage });
    app.post('/upload', upload.array('files'), (req, res) => {
        res.json({ success: true, files: req.files });
    });

    // Search
    app.get('/search', async (req, res) => {
        const { query, rootPath } = req.query;
        if (!query) return res.json([]);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        await fileRepo.search(query, rootPath, (file) => {
            res.write(`data: ${JSON.stringify(file)}\n\n`);
        });
        res.write('event: end\ndata: done\n\n');
        res.end();
    });

    // System Paths
    app.get('/system-paths', async (req, res) => {
        const drives = await fileRepo.getWindowsDrives();
        // Simplified for brevity, normally you'd use a service
        res.json({
            home: ROOT,
            desktop: path.join(ROOT, 'Desktop'),
            documents: path.join(ROOT, 'Documents'),
            downloads: path.join(ROOT, 'Downloads'),
            drives: drives
        });
    });

    // --- Download Routes ---
    const activeDownloads = new Map();

    app.get('/downloads', async (req, res) => {
        res.json(await downloadRepo.getAll());
    });

    app.post('/download-from-url', async (req, res) => {
        const { url, targetPath, filename } = req.body;
        const downloadId = Date.now().toString();
        const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');
        const fullPath = path.join(fileRepo.getSafePath(targetPath), safeFilename);
        
        const d = new Download({
            id: downloadId,
            url,
            filename: safeFilename,
            path: fullPath
        });
        await downloadRepo.save(d);
        
        performDownload(d, downloadRepo);
        
        res.json({ success: true, downloadId });
    });

    app.post('/pause-download', async (req, res) => {
        const { id } = req.body;
        const d = await downloadRepo.getById(id);
        if (d) {
            d.pause();
            await downloadRepo.save(d);
            const controller = activeDownloads.get(id);
            if (controller) controller.abort();
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not found' });
        }
    });

    app.post('/resume-download', async (req, res) => {
        const { id } = req.body;
        const d = await downloadRepo.getById(id);
        if (d) {
            d.resume();
            await downloadRepo.save(d);
            performDownload(d, downloadRepo);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not found' });
        }
    });

    app.post('/delete-download', async (req, res) => {
        const { id } = req.body;
        const d = await downloadRepo.getById(id);
        if (d) {
            const controller = activeDownloads.get(id);
            if (controller) controller.abort();
            
            await downloadRepo.delete(id);
            try {
                if (await fs.pathExists(d.path + '.part')) await fs.remove(d.path + '.part');
                if (await fs.pathExists(d.path)) await fs.remove(d.path);
            } catch (e) {}
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Download not found' });
        }
    });

    // --- Helper for Downloads (Streaming) ---
    async function performDownload(d, repo) {
        if (activeDownloads.has(d.id)) {
            activeDownloads.get(d.id).abort();
        }

        const controller = new AbortController();
        activeDownloads.set(d.id, controller);

        let writer;
        try {
            const headers = {};
            if (d.received > 0) {
                headers['Range'] = `bytes=${d.received}-`;
            }

            const response = await fetch(d.url, {
                headers,
                signal: controller.signal
            });

            if (response.status === 416) { // Range Not Satisfiable
                if (d.received >= d.total && d.total > 0) {
                    d.complete();
                    await repo.save(d);
                    return;
                }
            }

            if (!response.ok && response.status !== 206) {
                throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
            }

            const isPartial = response.status === 206;
            if (!isPartial) {
                d.received = 0;
                d.total = parseInt(response.headers.get('content-length') || '0');
            } else if (!d.total) {
                const range = response.headers.get('content-range');
                if (range) {
                    const match = range.match(/\/(\d+)$/);
                    if (match) d.total = parseInt(match[1]);
                }
            }

            writer = fs.createWriteStream(d.path + '.part', { flags: isPartial ? 'a' : 'w' });

            const reader = response.body.getReader ? response.body.getReader() : response.body;

            if (reader.on) { // Node stream
                for await (const chunk of reader) {
                    d.received += chunk.length;
                    writer.write(chunk);
                }
            } else { // Web stream
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    d.received += value.length;
                    writer.write(value);
                }
            }

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
                writer.end();
            });
            
            if (d.status === 'downloading') {
                await fs.move(d.path + '.part', d.path, { overwrite: true });
                d.complete();
            }
            await repo.save(d);
        } catch (err) {
            if (writer) writer.end();
            if (err.name === 'AbortError') {
                await repo.save(d);
            } else {
                d.setError(err.message);
                await repo.save(d);
            }
        } finally {
            activeDownloads.delete(d.id);
        }
    }

    app.listen(PORT, INTERFACE, () => {
        console.log(`Bautilus Backend (Hexagonal) running on http://${INTERFACE}:${PORT}`);
    });
}

startServer();
