class RenameFileUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(oldPath, newPath) {
        return await this.fileRepository.move(oldPath, newPath);
    }
}

module.exports = RenameFileUseCase;
