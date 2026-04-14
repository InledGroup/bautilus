class ClearDownloadsUseCase {
    constructor(downloadRepository) {
        this.downloadRepository = downloadRepository;
    }

    async execute() {
        return await this.downloadRepository.clear();
    }
}

module.exports = ClearDownloadsUseCase;
