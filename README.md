# 📂 Bautilus

> Un explorador de archivos y entorno de trabajo profesional, integrado directamente en tu navegador.  


> [!CAUTION]
> Este proyecto está en una fase beta por lo que no lo recomendamos para producción actualmente. Sigue la actualidad de este y otros proyectos de Inled Group en [nuestra newsletter](https://link.inled.es/newsletter-sub1).

[![License: GNU](https://img.shields.io/badge/License-GNU%20GPLv3-red.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![Tech](https://img.shields.io/badge/tech-JavaScript%20|%20Node.js-green.svg)](#)

**Bautilus** es una extensión de navegador diseñada para usuarios que buscan una gestión de archivos fluida y un espacio de trabajo productivo sin salir de la web. Inspirado en la estética limpia de GNOME (Nautilus), Bautilus transforma tu navegador en un sistema operativo ligero y potente.

---

## ✨ Características Principales

### 🛠️ Entorno de Trabajo Integrado
- **Edición de Código Pro:** Integra **Monaco Editor** (el motor detrás de VS Code) para editar archivos con resaltado de sintaxis, autocompletado y múltiples cursores.
- **Visualización de Documentos:** Soporte nativo para PDFs mediante **PDF.js**, permitiendo lectura y navegación fluida de documentos.
- **Reproductor Multimedia:** Experiencia de audio y video premium gracias a la integración de **Plyr**.

### 📁 Gestión de Archivos Avanzada
- **Interfaz Adwaita:** Estética moderna y familiar basada en los iconos y el estilo de GNOME.
- **Compresión Integrada:** Manejo de archivos comprimidos con **JSZip**.
- **Acceso Rápido:** Navegación por carpetas estándar (Documentos, Descargas, Imágenes, Videos).

### 🖥️ Componente de Servidor
- Incluye un servidor **Node.js** para facilitar la persistencia y la interacción con el sistema de archivos local de forma segura.

---

## 🚀 Tecnologías Utilizadas

Bautilus está construido sobre los estándares más exigentes de la web moderna:

- **Frontend:** HTML5, CSS3 (Custom Properties), JavaScript (ES6+).
- **Editor:** [Monaco Editor](https://microsoft.github.io/monaco-editor/) para una experiencia de codificación de nivel superior.
- **PDF:** [PDF.js](https://mozilla.github.io/pdf.js/) de Mozilla.
- **Media:** [Plyr](https://plyr.io/) para un reproductor multimedia accesible y personalizable.
- **Backend:** Node.js (Express) para el puente de comunicación con el sistema.
- **Iconografía:** Set de iconos Adwaita.

---

## 🛠️ Instalación

### 1. Extensión de Navegador
Para instalar la extensión en modo desarrollo (Chrome/Edge/Brave):
1. Clona este repositorio.
2. Abre `chrome://extensions/` en tu navegador.
3. Activa el **"Modo de desarrollador"** (Developer mode).
4. Haz clic en **"Cargar descomprimida"** (Load unpacked) y selecciona la carpeta `extension/` de este proyecto.

### 2. Servidor Backend
El servidor es necesario para ciertas funciones de gestión de archivos:
```bash
cd server
npm install
node index.js
```

---


## 🤝 Contribución

¿Quieres mejorar Bautilus? ¡Las contribuciones son bienvenidas!
1. Haz un Fork del proyecto.
2. Crea tu rama de características (`git checkout -b feature/AmazingFeature`).
3. Haz commit de tus cambios (`git commit -m 'Add some AmazingFeature'`).
4. Push a la rama (`git push origin feature/AmazingFeature`).
5. Abre un Pull Request.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo `LICENSE` para más detalles.

---

**Desarrollado con ❤️ para la productividad web.**
