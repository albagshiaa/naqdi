// ============================================
// NAQDI — LOGGING (production mode)
// window.dbg() is available but silent
// ============================================
window.dbg = function() {};

// Catch unhandled errors silently
window.addEventListener('error', (e) => {
  console.error('[Error]', e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled]', e.reason);
});
