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
  item modal and edit, move or delete it, and use "+ Add an item to this box"
  at the foot of the list to add one without a photo. The list refreshes in
  place afterwards.
- **Moving an item** repoints `item.photoSet` at a photo of the destination
  box and reissues `item.id`, because both encode the box. `nextItemId()`
  scans existing ids rather than counting items - counting collides as soon
  as anything has been deleted.

### The sorting shelf

An item with an empty `photoSet` is **on the sorting shelf** - out of its box
but not yet filed, like a library's returns trolley. That is the only way to
express "no box", since the box is derived from `photoSet` and never stored.

Never derive the box inline. `itemBoxNumber()` returns the box or `null`, and
`itemLocationLabel()` renders either the box label or "Sorting shelf". Every
caller goes through these, so "no box" is a case the app handles rather than
an empty string leaking into a `=== String(boxNumber)` comparison and quietly
matching nothing.

The shelf surfaces in three places: a panel above the photo grid
(`renderSortingShelf()`, hidden when empty), a group listed first in "Show All
Inventory", and the location chip on search results. Anything that changes
inventory must call `renderSortingShelf()` alongside `refreshBoxContentsIfOpen()`.
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

**Model slugs rot.** `MODELS` in app.js pins OpenRouter slugs, and OpenRouter
retires old ones: `anthropic/claude-3-haiku` was live in September 2026 and
gone by October, which surfaced only as "API error: 404" the moment anyone
sent a chat message. If the AI features start failing, check
`https://openrouter.ai/api/v1/models` before debugging anything else.
A 404 from OpenRouter now names the dead model in the UI.

### 4. Add Stuff
- Chat-based interface for adding photos and inventory
- AI-powered tool identification from photos (via OpenRouter)
- Photos stored in Google Drive
- Saying "new box" asks which series it belongs to via `askForBoxPrefix()`:
  a numbered menu of the prefixes already in use, most recently used first,
  plus "Start a new series". Typing a name still works. Making the user
  retype a prefix exactly is what produced a stray plain "Box 7" instead of
  a second seed-starting box.
- The file input deliberately has **no `capture` attribute**, so the phone
  offers the photo library as well as the camera. Adding `capture` back
  would force the camera and make existing photos unusable.
- Every chosen photo goes through `prepareImageForUpload()`: re-encoded to
  JPEG, longest edge capped at `MAX_PHOTO_EDGE`. Library photos can be
  HEIC, PNG or screenshots and several MB, but the uploader names
  everything `{box}{view}.jpg` - so without re-encoding a HEIC would be
  stored as .jpg and fail to decode outside Safari. Falls back to the
  original bytes if the browser cannot decode the file.

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

**Resolve a typed box by PREFIX, never by searching for label substrings.**
`parseBoxReference()` tries each known prefix longest-first and reads the
number after it. Substring search cannot be made safe here: a shorter label
always hides inside a longer one. "GardenBox 2" contains "Box 2", and so does
"Seed starting box 2" - the latter *with* a word boundary in front, so even
boundary-checked matching resolved it to plain Box 2 and filed the items
there silently. Prefixes containing the word "box" are normal, not an edge
case.

Labels are positional within a prefix, so "<prefix> N" is the Nth box sharing
that prefix - `findBoxByLabel()` indexes the peer list rather than comparing
rendered strings.

Naming a series at a position that does not exist yet - "Seed starting box 2"
when only one exists - starts the next box in that series, via
`newBoxPrefixFromMessage()`.

That helper must NOT claim "new box". It parses as the default prefix with no
position, and treating it as "extend the Box series" swallowed the prefix
prompt - the user was never asked what to call the box and silently got
another plain one. A reference with no number and the default prefix is a
request to name a box, not to extend a series.

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
- Uses Claude Haiku for chat, Claude Sonnet for vision (current slugs in
  `MODELS`; verify against OpenRouter's live model list when they fail)

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
