/**
 * @interface DownloadRepository
 */
class DownloadRepository {
    async getAll() { throw new Error('Method not implemented'); }
    async getById(id) { throw new Error('Method not implemented'); }
    async save(download) { throw new Error('Method not implemented'); }
    async delete(id) { throw new Error('Method not implemented'); }
    async clear() { throw new Error('Method not implemented'); }
}

module.exports = DownloadRepository;
