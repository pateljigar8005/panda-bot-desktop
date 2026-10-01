// Apply theme before first paint to avoid a flash. A file, not inline, so the CSP can forbid inline scripts.
try {
  var t = JSON.parse(localStorage.getItem('ui-store') || '{}').state?.theme || 'system'
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
} catch (e) {}
