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

### Google Drive (for photos & inventory)
1. Tap the gear icon → **Connect Google Drive**
2. Sign in with your Google account
3. Authorize the app to access its own folder
4. Your photos and inventory are stored in a "Trouve-Tout" folder in your Drive

### OpenRouter (for Ask AI)
1. Go to the **Ask AI** tab
2. Tap **Connect with OpenRouter**
3. Sign in or create an account (free)
4. Authorize the app

## Adding Photos

1. Go to the **+ Add Stuff** tab
2. Tap the camera button to take or select a photo
3. AI will identify tools in the photo (if OpenRouter connected)
4. Confirm or edit the detected items
5. Items are saved to your inventory

## Adding Inventory Items

You can add items with or without photos:
- **Item Name** (required): e.g., "Belt Sander"
- **Brand**: e.g., "DeWalt"
- **Model**: e.g., "DW433"
- **Type**: e.g., "electric", "pneumatic", "hand tool"
- **Notes**: e.g., "In case", "needs new belt"

## Naming Boxes

Boxes are called "Box 1", "Box 2", … by default. If a box lives somewhere
else, give it its own name:

- **When creating one:** say "new box" in Add Stuff and enter a prefix, e.g. `GardenBox`
- **Later:** open any photo of the box and tap the pencil next to the box name

You enter only the prefix — the number is added automatically, counting boxes
that share that prefix. So your first garden box shows as **GardenBox 1**,
the next as **GardenBox 2**, while your numbered boxes carry on as Box 1, 2, 3.

Note: the number is a position, so deleting a box renumbers the ones after it
that share its prefix.

## Deleting Photos

1. Tap a photo to open it
2. Tap **Delete Photo**
3. Confirm deletion

## Offline Use

The app works offline after first load. Images are cached locally for fast loading on return visits.
