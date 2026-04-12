class ListFilesUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(path) {
        return await this.fileRepository.list(path);
    }
}

module.exports = ListFilesUseCase;
