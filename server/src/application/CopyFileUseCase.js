class CopyFileUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(source, destination) {
        return await this.fileRepository.copy(source, destination);
    }
}

module.exports = CopyFileUseCase;
