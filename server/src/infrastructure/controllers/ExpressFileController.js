class ExpressFileController {
    constructor(listFilesUseCase) {
        this.listFilesUseCase = listFilesUseCase;
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

    // Add more methods for other file operations
}

module.exports = ExpressFileController;
