const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const DownloadRepository = require('../../domain/DownloadRepository');
const Download = require('../../domain/Download');

class FileDownloadRepository extends DownloadRepository {
    constructor() {
        super();
        this.configDir = path.join(os.homedir(), '.bautilus');
        this.downloadsFile = path.join(this.configDir, 'downloads.json');
        this.downloads = {};
        this._initialized = false;
    }

    async _ensureInitialized() {
        if (this._initialized) return;
        try {
            if (await fs.pathExists(this.downloadsFile)) {
                const data = await fs.readJson(this.downloadsFile);
                for (const id in data) {
                    this.downloads[id] = new Download(data[id]);
                    // Reset "downloading" to "paused" on load
                    if (this.downloads[id].status === 'downloading') {
                        this.downloads[id].status = 'paused';
                    }
                }
            }
        } catch (e) { console.error('Error loading downloads:', e); }
        this._initialized = true;
    }

    async getAll() {
        await this._ensureInitialized();
        return Object.values(this.downloads).sort((a,b) => b.startTime - a.startTime);
    }

    async getById(id) {
        await this._ensureInitialized();
        return this.downloads[id] || null;
    }

    async save(download) {
        await this._ensureInitialized();
        this.downloads[download.id] = download;
        await this._persist();
    }

    async delete(id) {
        await this._ensureInitialized();
        delete this.downloads[id];
        await this._persist();
    }

    async clear() {
        await this._ensureInitialized();
        for (const id in this.downloads) {
            if (this.downloads[id].status !== 'downloading') {
                delete this.downloads[id];
            }
        }
        await this._persist();
    }

    async _persist() {
        try {
            await fs.ensureDir(this.configDir);
            const data = {};
            const history = Object.entries(this.downloads)
                .sort((a,b) => b[1].startTime - a[1].startTime)
                .slice(0, 50);
            
            for (const [id, d] of history) {
                data[id] = d;
            }
            await fs.writeJson(this.downloadsFile, data, { spaces: 2 });
        } catch (e) { console.error('Error persisting downloads:', e); }
    }
}

module.exports = FileDownloadRepository;
