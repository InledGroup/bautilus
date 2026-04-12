class File {
    constructor({ name, path, isDirectory, size, mtime, ext }) {
        this.name = name;
        this.path = path;
        this.isDirectory = isDirectory;
        this.size = size;
        this.mtime = mtime;
        this.ext = ext;
    }
}

module.exports = File;
