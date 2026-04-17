# Gym Tracker React PWA

Proyecto listo para publicar en GitHub Pages con React, TypeScript, Dexie, Tailwind CSS v4 y vite-plugin-pwa.

## Requisitos locales

- Node.js 20.19+ o 22.12+
- npm

## Ejecutar local

```bash
npm install
npm run dev
```

## Build local

```bash
npm run build
npm run preview
```

## Deploy en GitHub Pages

1. Crea un repositorio nuevo en GitHub.
2. Sube todos estos archivos al repo.
3. En GitHub, ve a **Settings > Pages**.
4. En **Build and deployment**, elige **GitHub Actions** como source.
5. Haz push a `main`.
6. El workflow `.github/workflows/deploy.yml` construirá la app y publicará `dist`.

## Notas

- El proyecto calcula el `base` automáticamente en GitHub Actions usando el nombre del repositorio.
- La app guarda datos localmente con IndexedDB.
- Puedes usar la pestaña de respaldo para exportar e importar datos.
- Para migrar datos desde la versión HTML/PWA anterior, conviene exportar un backup JSON y luego adaptar el import si tu estructura antigua difiere.
