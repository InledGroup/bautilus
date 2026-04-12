class Download {
    constructor({ id, url, filename, path, total, received, status, startTime, error }) {
        this.id = id;
        this.url = url;
        this.filename = filename;
        this.path = path;
        this.total = total || 0;
        this.received = received || 0;
        this.status = status || 'downloading'; // downloading, paused, completed, error
        this.startTime = startTime || Date.now();
        this.error = error || null;
    }

    getProgress() {
        if (this.total === 0) return 0;
        return this.received / this.total;
    }

    pause() {
        if (this.status === 'downloading') {
            this.status = 'paused';
        }
    }

    resume() {
        if (this.status !== 'downloading') {
            this.status = 'downloading';
        }
    }

    complete() {
        this.status = 'completed';
        if (this.total > 0) this.received = this.total;
    }

    setError(message) {
        this.status = 'error';
        this.error = message;
    }
}

module.exports = Download;
