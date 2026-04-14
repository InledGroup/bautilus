const { exec } = require('child_process');
const os = require('os');

class OpenSystemFileUseCase {
    constructor() {
    }

    async execute(targetPath) {
        let command = '';
        const platform = os.platform();
        
        if (platform === 'win32') {
            command = `start "" "${targetPath}"`;
        } else if (platform === 'darwin') {
            command = `open "${targetPath}"`;
        } else {
            command = `xdg-open "${targetPath}"`;
        }

        return new Promise((resolve, reject) => {
            exec(command, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

module.exports = OpenSystemFileUseCase;
