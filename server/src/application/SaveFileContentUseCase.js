class SaveFileContentUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(targetPath, content) {
        return await this.fileRepository.saveContent(targetPath, content);
    }
}

module.exports = SaveFileContentUseCase;
