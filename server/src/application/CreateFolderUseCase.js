class CreateFolderUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(parentPath, name) {
        return await this.fileRepository.createFolder(parentPath, name);
    }
}

module.exports = CreateFolderUseCase;
