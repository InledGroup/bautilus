class ExpressFileController {
    constructor(useCases) {
        this.listFilesUseCase = useCases.listFilesUseCase;
        this.renameFileUseCase = useCases.renameFileUseCase;
        this.deleteFileUseCase = useCases.deleteFileUseCase;
        this.copyFileUseCase = useCases.copyFileUseCase;
        this.createFolderUseCase = useCases.createFolderUseCase;
        this.openSystemFileUseCase = useCases.openSystemFileUseCase;
        this.unzipFileUseCase = useCases.unzipFileUseCase;
        this.saveFileContentUseCase = useCases.saveFileContentUseCase;
        this.clearDownloadsUseCase = useCases.clearDownloadsUseCase;
    }

    async list(req, res) {
        try {
            const path = req.query.path;
            const result = await this.listFilesUseCase.execute(path);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async rename(req, res) {
        try {
            const { oldPath, newPath } = req.body;
            await this.renameFileUseCase.execute(oldPath, newPath);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            const { targetPath } = req.body;
            await this.deleteFileUseCase.execute(targetPath);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async copy(req, res) {
        try {
            const { source, destination } = req.body;
            await this.copyFileUseCase.execute(source, destination);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async createFolder(req, res) {
        try {
            const { parentPath, name } = req.body;
            await this.createFolderUseCase.execute(parentPath, name);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async openSystem(req, res) {
        try {
            const { targetPath } = req.body;
            await this.openSystemFileUseCase.execute(targetPath);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async unzip(req, res) {
        try {
            const { zipPath, createFolder } = req.body;
            const result = await this.unzipFileUseCase.execute(zipPath, createFolder);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async save(req, res) {
        try {
            const { targetPath, content } = req.body;
            await this.saveFileContentUseCase.execute(targetPath, content);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async clearDownloads(req, res) {
        try {
            await this.clearDownloadsUseCase.execute();
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    // Config management
    async getConfig(req, res) {
        // Mock implementation for now, or you can use a ConfigUseCase/Repo
        res.json({ interface: 'localhost', port: 3001 });
    }

    async setConfig(req, res) {
        // Mock implementation
        res.json({ success: true });
    }
}

module.exports = ExpressFileController;
