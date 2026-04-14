const fs = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

class UnzipFileUseCase {
    constructor(fileRepository) {
        this.fileRepository = fileRepository;
    }

    async execute(zipPath, createFolder) {
        const safeZipPath = this.fileRepository.getSafePath(zipPath);
        const zip = new AdmZip(safeZipPath);
        
        let targetDir = path.dirname(safeZipPath);
        if (createFolder) {
            const folderName = path.basename(safeZipPath, path.extname(safeZipPath));
            targetDir = path.join(targetDir, folderName);
            await fs.ensureDir(targetDir);
        }

        zip.extractAllTo(targetDir, true);
        return { success: true };
    }
}

module.exports = UnzipFileUseCase;
