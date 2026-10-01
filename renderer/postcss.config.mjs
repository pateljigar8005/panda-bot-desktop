import path from 'node:path'

// Vite runs from the repo root, so point Tailwind at its config explicitly
export default { plugins: { tailwindcss: { config: path.join(import.meta.dirname, 'tailwind.config.mjs') }, autoprefixer: {} } }
