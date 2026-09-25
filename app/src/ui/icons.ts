/** Ikon SVG sederhana (24×24) supaya kontrol tidak bergantung pada emoji sistem. */
const svg = (path: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${path}</svg>`

export const ICONS = {
  play: svg('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/>'),
  prev: svg('<rect x="5" y="5" width="2.4" height="14" rx="1"/><path d="M19 6.2v11.6a1 1 0 0 1-1.52.85L9.2 13.03a1.2 1.2 0 0 1 0-2.06l8.28-5.62A1 1 0 0 1 19 6.2Z"/>'),
  next: svg('<rect x="16.6" y="5" width="2.4" height="14" rx="1"/><path d="M5 6.2v11.6a1 1 0 0 0 1.52.85l8.28-5.62a1.2 1.2 0 0 0 0-2.06L6.52 5.35A1 1 0 0 0 5 6.2Z"/>'),
  volume: svg('<path d="M4 9.5v5a1 1 0 0 0 1 1h3l4.3 3.6a.6.6 0 0 0 1-.46V5.36a.6.6 0 0 0-1-.46L8 8.5H5a1 1 0 0 0-1 1Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
}
