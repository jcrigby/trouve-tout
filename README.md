# Trouve-Tout

"Where's my crap?" — A simple PWA for searching and browsing a personal tool inventory.

**Live site:** https://jcrigby.github.io/trouve-tout/

## Features

### Browse Photos
Tap any photo to see its box number and contents. Swipe left/right to navigate between photos.

### Text Search
Search by item name, brand, model, or notes. Filter by category using the dropdown.

### Ask AI
Ask questions about your inventory in plain English:
- "Where's my belt sander?"
- "What nailers do I have?"
- "Show me everything cordless"

Requires connecting to OpenRouter (free account).

## Setup

### OpenRouter (for Ask AI)
1. Go to the **Ask AI** tab
2. Tap **Connect with OpenRouter**
3. Sign in or create an account (free)
4. Authorize the app

### GitHub PAT (for adding/deleting photos)
1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Tokens (classic)
2. Generate a new token with `repo` scope
3. Tap the gear icon in the app
4. Paste your token and tap **Save Token**

## Adding Photos

1. Tap **+ Add Photo** on the Browse Photos tab
2. Select a box number
3. Choose a photo from your library or take a new one
4. After upload, optionally add inventory items visible in the photo
5. Tap **Done** when finished

## Adding Inventory Items

After uploading a photo, you can add items:
- **Item Name** (required): e.g., "Belt Sander"
- **Brand**: e.g., "DeWalt"
- **Model**: e.g., "DW433"
- **Type**: e.g., "electric", "pneumatic", "hand tool"
- **Notes**: e.g., "In case", "needs new belt"

Tap **Save Item**, then **Add Another Item** for more, or **Done** to finish.

## Deleting Photos

1. Tap a photo to open it
2. Tap **Delete Photo**
3. Confirm deletion

Note: This deletes the photo from the repository. Inventory items referencing the photo are not automatically deleted.

## Offline Use

The app works offline after first load. Inventory data syncs when you're back online.
