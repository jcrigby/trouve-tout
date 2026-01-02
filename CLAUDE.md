# Tool Inventory PWA

## Project Overview
A simple static PWA for searching and browsing a personal tool inventory. Hosted on GitHub Pages.

## Purpose
"Where's my crap" — quickly find tools by searching or filtering. Each item links to photos showing where it was stored/photographed.

## Tech Stack
- Vanilla HTML/CSS/JS (no build step, no framework)
- Static hosting on GitHub Pages
- PWA with service worker for offline use
- Single page app

## Data
- `data/inventory.json` — array of tool items
- `images/` — photos named `1a.jpg`, `1b.jpg`, `2a.jpg`, `2b.jpg`, `3a.jpg`, `3b.jpg`, `4a.jpg`, `4b.jpg`

### Item Schema
```json
{
  "id": "1a1",
  "category": "Nail Guns & Fasteners",
  "photoSet": "1a/1b",
  "item": "15ga Finish Nailer",
  "brand": "Metabo HPT",
  "model": "NT 65MA4",
  "type": "pneumatic",
  "notes": "In case with manual and oil"
}
```

### Categories
1. Nail Guns & Fasteners (photoSet: 1a/1b)
2. Hand Tools & Misc (photoSet: 2a/2b)
3. Sanders & Grinder (photoSet: 3a/3b)
4. Saws & Grinders (photoSet: 4a/4b)

## Features
- Search box that filters items by any field (item, brand, model, notes)
- Filter by category
- Tap item to see associated photos
- Mobile-first responsive design
- Works offline after first load

## File Structure
```
/
├── index.html
├── manifest.json
├── sw.js
├── css/
│   └── style.css
├── js/
│   └── app.js
├── data/
│   └── inventory.json
└── images/
    ├── 1a.jpg
    ├── 1b.jpg
    ├── 2a.jpg
    ├── 2b.jpg
    ├── 3a.jpg
    ├── 3b.jpg
    ├── 4a.jpg
    └── 4b.jpg
```

## UI Notes
- Keep it simple and fast
- Large touch targets for mobile use in the shop
- Dark mode friendly (often used in garage/basement)
- No unnecessary animations or transitions

## Service Worker
Cache inventory.json and all images on first load for offline access.

## Don't
- No frameworks (React, Vue, etc.)
- No build tools (webpack, vite, etc.)
- No external dependencies
- No backend
