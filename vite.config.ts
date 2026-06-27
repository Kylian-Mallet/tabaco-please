import { defineConfig } from 'vite';

// GitHub Pages serves the project from /<repo>/, so assets must be referenced
// under that base. Locally (vite dev / preview) the base is '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tabaco-please/' : '/',
}));
