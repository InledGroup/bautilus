class DeleteFileUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(targetPath) {
        return await this.fileRepository.delete(targetPath);
    }
}

module.exports = DeleteFileUseCase;
