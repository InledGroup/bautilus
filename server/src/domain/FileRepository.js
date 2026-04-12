/**
 * @interface FileRepository
 */
class FileRepository {
    async list(path) { throw new Error('Method not implemented'); }
    async getStats(path) { throw new Error('Method not implemented'); }
    async createFolder(parentPath, name) { throw new Error('Method not implemented'); }
    async move(oldPath, newPath) { throw new Error('Method not implemented'); }
    async copy(source, destination) { throw new Error('Method not implemented'); }
    async delete(path) { throw new Error('Method not implemented'); }
    async saveContent(path, content) { throw new Error('Method not implemented'); }
    async search(query, rootPath, onMatch) { throw new Error('Method not implemented'); }
    async getWindowsDrives() { throw new Error('Method not implemented'); }
}

module.exports = FileRepository;
