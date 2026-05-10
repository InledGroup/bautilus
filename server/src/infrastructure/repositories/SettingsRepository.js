const fs = require('fs-extra');
const path = require('path');
const os = require('os');

class SettingsRepository {
    constructor() {
        this.configDir = path.join(os.homedir(), '.bautilus');
        this.settingsFile = path.join(this.configDir, 'settings.json');
        this.settings = null;
    }

    async _ensureInitialized() {
        if (this.settings) return;
        try {
            if (await fs.pathExists(this.settingsFile)) {
                this.settings = await fs.readJson(this.settingsFile);
            } else {
                this.settings = {
                    systemPaths: {}
                };
            }
        } catch (e) {
            console.error('Error loading settings:', e);
            this.settings = { systemPaths: {} };
        }
    }

    async getSystemPaths() {
        await this._ensureInitialized();
        return this.settings.systemPaths || {};
    }

    async saveSystemPaths(paths) {
        await this._ensureInitialized();
        this.settings.systemPaths = paths;
        await this._persist();
    }

    async getPartitionLabels() {
        await this._ensureInitialized();
        return this.settings.partitionLabels || {};
    }

    async savePartitionLabel(name, label) {
        await this._ensureInitialized();
        if (!this.settings.partitionLabels) this.settings.partitionLabels = {};
        this.settings.partitionLabels[name] = label;
        await this._persist();
    }

    async _persist() {
        try {
            await fs.ensureDir(this.configDir);
            await fs.writeJson(this.settingsFile, this.settings, { spaces: 2 });
        } catch (e) {
            console.error('Error persisting settings:', e);
        }
    }
}

module.exports = SettingsRepository;
