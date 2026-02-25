# 📂 Bautilus

> A professional file explorer and workspace, integrated directly into your browser.

> [!CAUTION]
> This project is in beta phase, so we do not recommend it for production currently. Follow the news of this and other Inled Group projects in [our newsletter](https://link.inled.es/newsletter-sub1).

[![License: GNU](https://img.shields.io/badge/License-GNU%20GPLv3-red.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![Tech](https://img.shields.io/badge/tech-JavaScript%20|%20Node.js-green.svg)](#)

**Bautilus** is a browser extension designed for users seeking seamless file management and a productive workspace without leaving the web. Inspired by the clean aesthetics of GNOME (Nautilus), Bautilus transforms your browser into a lightweight and powerful operating system.

---

## ✨ Key Features

### 🛠️ Integrated Workspace
- **Pro Code Editing:** Integrates **Monaco Editor** (the engine behind VS Code) to edit files with syntax highlighting, autocompletion, and multiple cursors.
- **Document Viewing:** Native support for PDFs via **PDF.js**, allowing smooth reading and navigation of documents.
- **Multimedia Player:** Premium audio and video experience thanks to the integration of **Plyr**.

### 📁 Advanced File Management
- **Adwaita Interface:** Modern and familiar aesthetics based on GNOME icons and style.
- **Integrated Compression:** Handling of compressed files with **JSZip**.
- **Quick Access:** Navigation through standard folders (Documents, Downloads, Images, Videos).

### 🖥️ Server Component
- Includes a **Node.js** server to facilitate persistence and interaction with the local file system securely.

---

## 🚀 Technologies Used

Bautilus is built on the most demanding standards of the modern web:

- **Frontend:** HTML5, CSS3 (Custom Properties), JavaScript (ES6+).
- **Editor:** [Monaco Editor](https://microsoft.github.io/monaco-editor/) for a top-tier coding experience.
- **PDF:** [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla.
- **Media:** [Plyr](https://plyr.io/) for an accessible and customizable multimedia player.
- **Backend:** Node.js (Express) for the communication bridge with the system.
- **Iconography:** Adwaita icon set.

---

## 🛠️ Installation

### 1. Browser Extension
To install the extension in development mode (Chrome/Edge/Brave):
1. Clone this repository.
2. Open `chrome://extensions/` in your browser.
3. Enable **"Developer mode"**.
4. Click on **"Load unpacked"** and select the `extension/` folder of this project.

### 2. Backend Server
The server is required for certain file management functions:
```bash
cd server
npm install
node index.js
```

---

## 🤝 Contribution

Want to improve Bautilus? Contributions are welcome!
1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

This project is licensed under the MIT License. See the `LICENSE` file for more details.

---

**Developed with ❤️ for web productivity.**
