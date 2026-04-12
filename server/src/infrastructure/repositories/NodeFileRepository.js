const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const FileRepository = require('../../domain/FileRepository');
const File = require('../../domain/File');

class NodeFileRepository extends FileRepository {
    constructor(root) {
        super();
        this.root = root || os.homedir();
    }

    getSafePath(requestPath) {
        if (!requestPath || requestPath === 'undefined' || requestPath === 'root') return this.root;
        return path.resolve(requestPath);
    }

    async getWindowsDrives() {
        if (os.platform() !== 'win32') return [];
        try {
            const { stdout } = await execPromise('powershell "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"');
            return stdout.split(/\r?\n/).filter(l => l.trim() !== '').map(l => l.trim());
        } catch (e) {
            return ['C:\\'];
        }
    }

    async list(targetPath) {
        if (os.platform() === 'win32' && (!targetPath || targetPath === 'root')) {
            const drives = await this.getWindowsDrives();
            return {
                currentPath: 'root',
                parentPath: null,
                files: drives.map(d => new File({
                    name: d,
                    path: d,
                    isDirectory: true,
                    size: 0,
                    mtime: new Date(),
                    ext: ''
                }))
            };
        }

        const safePath = this.getSafePath(targetPath);
        const stats = await fs.stat(safePath);
        if (!stats.isDirectory()) throw new Error('Path is not a directory');

        const entries = await fs.readdir(safePath);
        const files = await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(safePath, entry);
            try {
                const entryStats = await fs.stat(fullPath);
                return new File({
                    name: entry,
                    path: fullPath,
                    isDirectory: entryStats.isDirectory(),
                    size: entryStats.size,
                    mtime: entryStats.mtime,
                    ext: path.extname(entry).toLowerCase()
                });
            } catch (err) { return null; }
        }));

        return {
            currentPath: safePath,
            parentPath: path.dirname(safePath),
            files: files.filter(f => f !== null)
        };
    }

    async getStats(path) {
        return await fs.stat(this.getSafePath(path));
    }

    async createFolder(parentPath, name) {
        const target = path.join(this.getSafePath(parentPath), name);
        await fs.ensureDir(target);
    }

    async move(oldPath, newPath) {
        await fs.move(oldPath, newPath, { overwrite: false });
    }

    async copy(source, destination) {
        await fs.copy(source, destination);
    }

    async delete(path) {
        await fs.remove(path);
    }

    async saveContent(path, content) {
        await fs.writeFile(this.getSafePath(path), content, 'utf8');
    }

    async search(query, rootPath, onMatch) {
        const startPath = this.getSafePath(rootPath);
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
                            onMatch(new File({
                                name: entry.name,
                                path: fullPath,
                                isDirectory: entry.isDirectory(),
                                size: stats.size,
                                mtime: stats.mtime,
                                ext: path.extname(entry.name).toLowerCase()
                            }));
                            count++;
                        } catch (e) {}
                    }
                    if (entry.isDirectory()) await searchInternal(fullPath);
                }
            } catch (e) {}
        };

        await searchInternal(startPath);
    }
}

module.exports = NodeFileRepository;
