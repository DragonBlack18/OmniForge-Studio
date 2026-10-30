import React from 'react';
// Small, original line icon set; no runtime icon library or remote asset dependency.
const SHAPES = {
  home: 'm3 10 9-7 9 7 M5 9v11h14V9 M9 20v-7h6v7',
  workflow: 'M6 3v6 M6 15v6 M18 3v6 M18 15v6 M6 9h12 M6 15h12 M3 9h6v6H3z M15 9h6v6h-6z',
  cad: 'M4 3h16v18H4z M4 8h16 M9 8v13 M12 12h5l-5 5z',
  code: 'm8 8-4 4 4 4 m8-8 4 4-4 4 M14 5l-4 14',
  templates: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  folder: 'M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  plug: 'M8 3v5 M16 3v5 M6 8h12v5a6 6 0 0 1-12 0z M12 19v3',
  calendar: 'M3 6h18v15H3z M3 10h18 M8 3v6 M16 3v6 M8 15h4 M14 15h3 M14 19h3',
  git: 'M7 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M7 7v10 M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M7 10h7a3 3 0 0 1 3 3v2 M17 15a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  history: 'M4 7V3 M4 7h4 M4.4 7a9 9 0 1 1-1.1 9 M12 7v5l3.5 2',
  info: 'M12 17v-5 M12 8h.01 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  panel: 'M3 4h18v16H3z M10 4v16',
  collapse: 'M15 4h6v16h-6 M11 8l-4 4 4 4 M3 4h12v16H3',
  expand: 'M9 4H3v16h6 M13 8l4 4-4 4 M9 4h12v16H9',
  arrow: 'M5 12h14 m-6-6 6 6-6 6',
  close: 'M5 5l14 14 M19 5 5 19',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z m6-2 4 4',
  layers: 'm12 2 9 5-9 5-9-5z m-9 10 9 5 9-5 m-18 5 9 5 9-5',
  check: 'M5 12l5 5L20 7',
  pointer: 'M5 3 5 20 9.3 15.4 12.5 21 15.2 19.5 11.8 13.2 20 11z',
  hand: 'M6 12V8a2 2 0 0 1 4 0v4-5a2 2 0 0 1 4 0v5-3a2 2 0 0 1 4 0v4-2a2 2 0 0 1 4 0v5a6 6 0 0 1-6 6h-4a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 2-3z',
  line: 'M4 20 20 4',
  rectangle: 'M4 5h16v14H4z',
  circle: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  chevron: 'm9 6 6 6-6 6'
};
export function NavGlyph({name, size = 18}) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round"
    strokeLinejoin="round"><path d={SHAPES[name] || SHAPES.info}/></svg>;
}
