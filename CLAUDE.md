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
- GitHub API for photo/inventory management (via PAT)

## Three Modes

### 1. Browse Photos (Visual Grep)
- Shows all box photos in a grid
- Tap a photo to see the box number and category
- Swipe left/right to navigate between photos
- "Show Box Contents" button shows inventory for that box
- "Delete Photo" button removes photo (requires GitHub PAT)

### 2. Text Search
- Type in search box to filter items by item name, brand, model, notes, or type
- Optional category dropdown filter
- Tap a result to see item details and associated photos

### 3. Ask AI
- Natural language queries about inventory
- Uses OpenRouter OAuth PKCE (no backend needed)
- Connects to Claude Haiku via OpenRouter API

## Data

### Inventory File
`data/inventory.json` — array of tool items

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

### PhotoSets File
`data/photosets.json` — array of photo metadata (loaded at runtime)

```json
{
  "file": "1a.jpg",
  "box": 1,
  "view": "a",
  "category": "Nail Guns & Fasteners"
}
```

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

### Adding Photos via App (Preferred)
1. Configure GitHub PAT in Settings (gear icon)
2. Tap "+ Add Photo" button
3. Select box number, choose photo
4. Optionally add inventory items
5. Photo and metadata are committed directly to GitHub

### Deleting Photos via App
1. Tap photo to open modal
2. Tap "Delete Photo" button
3. Confirm deletion
4. Removes image file and photosets.json entry

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
├── js/
│   └── app.js               # Main app logic
├── data/
│   ├── inventory.json       # Inventory items
│   └── photosets.json       # Photo metadata
└── images/
    └── {box}{view}.jpg      # Photo files
```

## Service Worker Caching Strategy
- **inventory.json, photosets.json**: Network-first (fetches fresh when online, cache offline)
- **Other assets**: Stale-while-revalidate (serves cached, updates in background)
- Bump `CACHE_NAME` version in sw.js when changing code

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

### OpenRouter (Ask AI)
- OAuth PKCE flow for static sites
- API key stored in localStorage
- Uses Claude Haiku model

### GitHub API (Photo Management)
- Personal Access Token with `repo` scope
- Stored in localStorage
- Used for: upload photos, delete photos, update photosets.json, update inventory.json

## UI Notes
- Keep it simple and fast
- Large touch targets for mobile use in the shop
- Dark mode friendly (often used in garage/basement)
- No unnecessary animations or transitions

## Don't
- No frameworks (React, Vue, etc.)
- No build tools (webpack, vite, etc.)
- No external dependencies (except API calls)
- No backend server
