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
- OpenRouter API for AI queries (OAuth PKCE flow)
- Google Drive API for photo/inventory storage (OAuth)

## Four Modes

### 1. Browse Photos (Visual Grep)
- Shows all box photos in a grid
- Tap a photo to see the box number and category
- Swipe left/right to navigate between photos
- Pinch to zoom the photo, drag to pan while zoomed, double tap to toggle
  (double click / wheel on desktop). Zoom resets when the photo changes or
  the modal closes. Swiping only navigates at fit, so a pan while zoomed
  does not skip to the next photo.
- "Show Box Contents" lists that box's inventory; tap any item to open the
  item modal and edit or delete it. The list refreshes in place afterwards.
- The delete button is labelled by consequence, via `deleteButtonLabel()`:
  "Delete This View" / "Delete Photo" / "Delete Photo & N Items" /
  "Delete Box & N Items". Deleting a photo also deletes any item whose only
  photo it was, so the label says so rather than hiding it.

### 2. Text Search
- Type in search box to filter items by item name, brand, model, notes, or type
- Optional category dropdown filter
- Tap a result to see item details and associated photos

### 3. Ask AI
- Natural language queries about inventory
- Uses OpenRouter OAuth PKCE (no backend needed)
- Connects to Claude Haiku via OpenRouter API

### 4. Add Stuff
- Chat-based interface for adding photos and inventory
- AI-powered tool identification from photos (via OpenRouter)
- Photos stored in Google Drive

## Data Storage

All data is stored in the user's Google Drive in a "Trouve-Tout" folder:
- `inventory.json` — array of tool items
- `photosets.json` — array of photo metadata
- Image files (JPG)

### Item Schema
```json
{
  "id": "1a1",
  "category": "Nail Guns & Fasteners",
  "photoSet": "1a",
  "item": "15ga Finish Nailer",
  "brand": "Metabo HPT",
  "model": "NT 65MA4",
  "type": "pneumatic",
  "notes": "In case with manual and oil"
}
```

### PhotoSets Schema
```json
{
  "file": "1a.jpg",
  "box": 1,
  "view": "a",
  "boxPrefix": "GardenBox",
  "category": "Nail Guns & Fasteners",
  "driveId": "1abc123...",
  "caption": "Top shelf nailers and staplers"
}
```

`boxPrefix` is optional and defaults to `Box`. It is a property of the whole
box, so every photoset row for a given box carries the same value.

### Box Numbers vs Box Names

`box` is **identity, not display**. It builds photo filenames
(`{box}{view}.jpg`) and item ids (`{box}{view}{seq}`), and is recovered from
an item by stripping letters off `item.photoSet`. It must stay numeric and
globally unique — never renumber it to make a label look right.

What the user sees is `boxPrefix` plus a position: `boxLabel()` counts boxes
sharing a prefix, so the first `GardenBox` reads "GardenBox 1" even though it
is internally box 5. Boxes with no prefix read "Box 1", "Box 2", … exactly as
before. Render box names with `boxLabel(n)` — never hardcode `Box ${n}`.

Because the index is positional, deleting a box renumbers the boxes after it
within the same prefix.

### ID Convention
- Format: `{box}{view}{sequence}` (e.g., "1a1", "1a2", "2a1")
- Auto-generated when adding items via the app

### Categories (by box)
1. **Box 1** - Nail Guns & Fasteners
2. **Box 2** - Hand Tools & Misc
3. **Box 3** - Sanders & Grinder
4. **Box 4** - Saws & Grinders
5. **Box 5** - (New Box)

## Images

### Naming Convention
- Format: `{box}{view}.jpg` (e.g., 1a.jpg, 1b.jpg, 1c.jpg)
- **Box number** = the number (1, 2, 3, 4, 5)
- **View letter** = different angles/perspectives (a, b, c, etc.)
- Auto-assigned when uploading via the app

### Image Caching
- Images are cached in IndexedDB for fast loading on return visits
- Cache persists across sessions
- Only cleared when connecting to a different Google account

## File Structure
```
/
├── index.html
├── manifest.json
├── sw.js                    # Service worker
├── README.md                # User documentation
├── CLAUDE.md                # Developer documentation (this file)
├── .github/
│   └── workflows/
│       └── auto-merge-claude.yml
├── css/
│   └── style.css
├── icons/                   # PWA / home-screen icons
│   ├── icon.svg
│   ├── icon-180.png         # apple-touch-icon
│   ├── icon-192.png
│   └── icon-512.png
└── js/
    └── app.js               # Main app logic
```

## PWA Path Rules (important)

The site is served from a **subpath** (`https://jcrigby.github.io/trouve-tout/`),
not a domain root. Always use **relative** URLs (`./css/style.css`), never
root-absolute ones (`/css/style.css`) — the latter resolve to
`jcrigby.github.io/...`, which is a different site, and 404.

This applies to `sw.js` (the `ASSETS` precache list) and `manifest.json`
(`start_url`, `scope`, `icons[].src`).

## Service Worker Caching Strategy
- **App assets**: Stale-while-revalidate (serves cached, updates in background)
- **Images**: Cached in IndexedDB (separate from service worker cache)
- Bump `CACHE_NAME` version in sw.js when changing code

### Bumping the build number

Three places, keep them in step:
1. `BUILD_NUMBER` in `js/app.js`
2. `CACHE_NAME` in `sw.js`
3. the `?v=` on the `js/app.js` script tag in `index.html`

The number shown in the page footer and in Settings both come from
`BUILD_NUMBER` in app.js - deliberately, not from the HTML - so the app
reports the build of the **script actually running**. If a stale `app.js`
is being served from cache, the footer shows the old number instead of the
fresh HTML's, which is what makes it useful for spotting cache staleness
on iOS.

## Claude Workflow (Auto-Deploy)

### How It Works
1. Claude can only push to branches matching `claude/*-{sessionId}` pattern
2. A GitHub Action auto-merges `claude/ship-**` branches to `main`
3. GitHub Pages deploys from `main`
4. Non-ship branches (e.g., `claude/build-*`) do NOT auto-merge (for testing)

### Branch Naming Convention

**To deploy changes:** Use `claude/ship-{description}-{sessionId}`
- Example: `claude/ship-fix-photos-abc123`
- The GitHub Action triggers on push and auto-merges to `main`
- GitHub Pages then deploys automatically

**For work-in-progress:** Use `claude/{description}-{sessionId}` (no `ship-` prefix)
- Example: `claude/build-feature-abc123`
- These branches will NOT auto-merge
- Use for testing or when changes aren't ready to deploy

### Deploying Changes
When ready to deploy, always push to a `ship` branch:
```bash
git checkout -b claude/ship-{description}-{sessionId}
git push -u origin claude/ship-{description}-{sessionId}
```

### Limitations
- Claude cannot push directly to `main` (403 forbidden)
- Must use `claude/ship-*` branch for auto-deploy
- The workflow uses `--ff-only` first, falls back to merge commit if needed

## External Integrations

### Google Drive (Photo & Data Storage)
- OAuth via Google Identity Services (GIS)
- Access token stored in localStorage
- Silent refresh attempted on token expiry
- Used for: store photos, load/save inventory.json, load/save photosets.json

### OpenRouter (Ask AI)
- OAuth PKCE flow for static sites
- API key stored in localStorage
- Uses Claude Haiku for chat, Claude Sonnet for vision

## UI Notes
- Keep it simple and fast
- Large touch targets for mobile use in the shop
- Dark mode friendly (often used in garage/basement)
- Glassmorphism and subtle glow effects for modern look

## Testing Environment
- **Primary testing is on Chrome for iOS** (iPhone)
- Hard refresh on iOS: Settings → Safari → Clear History and Website Data, or use "Request Desktop Site" toggle
- Service worker updates can be stubborn on iOS - bump cache version in sw.js
- Test touch interactions, not just click events
- File input behaves differently on mobile (camera option appears)

## Don't
- No frameworks (React, Vue, etc.)
- No build tools (webpack, vite, etc.)
- No external dependencies (except API calls)
- No backend server
