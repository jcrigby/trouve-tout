// Photo sets - loaded from JSON
let photoSets = [];

let inventory = [];
let currentBoxNumber = null;
let currentPhotoIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

// Build number. Lives here rather than in index.html so what you see is the
// build of the SCRIPT actually running - if a stale app.js is being served
// from cache, the footer says so instead of reporting the fresh HTML.
// Bump together with CACHE_NAME in sw.js and the ?v= on the script tag.
const BUILD_NUMBER = '83';

// OpenRouter OAuth config
const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CALLBACK_URL = window.location.origin + window.location.pathname;

// Google Drive config (using Google Identity Services)
const GOOGLE_CLIENT_ID = '339196755594-oajh6pqn0o178o9ipsvg7d7r86dg2sv5.apps.googleusercontent.com';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
// Give up on a silent token refresh rather than hanging startup on it
const SILENT_REFRESH_TIMEOUT_MS = 6000;

// AI Models
const MODELS = {
  vision: 'anthropic/claude-sonnet-4',  // For photo analysis
  chat: 'anthropic/claude-3-haiku'       // For general conversation
};

// ==================== Box labels ====================
//
// The numeric `box` is IDENTITY, not display: it builds photo filenames
// ({box}{view}.jpg), item ids ({box}{view}{seq}), and is recovered from an
// item by stripping letters off item.photoSet. It must stay numeric and
// globally unique.
//
// A box's display name is a prefix stored on its photoset rows. The number
// shown beside the prefix counts boxes sharing that prefix, so the first
// "GardenBox" reads "GardenBox 1" even though it is internally box 5.
// Note: these indexes are positional, so deleting a box renumbers the ones
// after it within the same prefix.
const DEFAULT_BOX_PREFIX = 'Box';

// The prefix a box was given, or the default.
function boxPrefixOf(boxNumber) {
  const row = photoSets.find(p => p.box === Number(boxNumber) && p.boxPrefix);
  return (row && row.boxPrefix) || DEFAULT_BOX_PREFIX;
}

// Every distinct box number, ascending.
function allBoxNumbers() {
  return [...new Set(photoSets.map(p => p.box))].sort((a, b) => a - b);
}

// Display name for a box, e.g. "Box 2" or "GardenBox 1".
function boxLabel(boxNumber) {
  const num = Number(boxNumber);
  const prefix = boxPrefixOf(num);
  const peers = allBoxNumbers().filter(b => boxPrefixOf(b) === prefix);
  const index = peers.indexOf(num);
  // A box with no photos yet has no peers to count among; fall back to its
  // own number so the label is still meaningful.
  return `${prefix} ${index >= 0 ? index + 1 : num}`;
}

// Rename a box: the prefix belongs to the box, so it applies to every
// photoset row for that box, not just the photo in view.
async function setBoxPrefix(boxNumber, prefix) {
  const trimmed = (prefix || '').trim() || DEFAULT_BOX_PREFIX;
  const rows = photoSets.filter(p => p.box === Number(boxNumber));
  if (rows.length === 0) return false;
  rows.forEach(p => { p.boxPrefix = trimmed; });
  await DriveStorage.savePhotosets(photoSets);
  return true;
}

// Match a typed box reference against the labels actually in use, so
// "GardenBox 1" selects the right box and not box 1.
function findBoxByLabel(message) {
  const msg = String(message || '').trim().toLowerCase();
  if (!msg) return null;
  // longest label first, so "GardenBox 1" wins over a bare "Box 1"
  const candidates = allBoxNumbers()
    .map(b => ({ box: b, label: boxLabel(b).toLowerCase() }))
    .sort((a, b) => b.label.length - a.label.length);
  const hit = candidates.find(c => msg.includes(c.label));
  return hit ? hit.box : null;
}

// DOM elements
const photoGrid = document.getElementById('photo-grid');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const results = document.getElementById('results');
const photoModal = document.getElementById('photo-modal');
const itemModal = document.getElementById('item-modal');
const tabs = document.querySelectorAll('.tab');
const modeContents = document.querySelectorAll('.mode-content');

// Go home - close all modals and switch to Browse Photos tab
function goHome() {
  // Close all modals
  document.querySelectorAll('.modal').forEach(modal => {
    modal.classList.remove('active');
  });

  // Switch to Browse Photos tab
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector('[data-mode="photos"]').classList.add('active');
  modeContents.forEach(content => {
    content.classList.toggle('active', content.id === 'photos-mode');
  });
}

// Write the build number into the footer and the Settings panel.
function stampBuildNumber() {
  document.querySelectorAll('#footer-build, #build-number')
    .forEach(el => { el.textContent = BUILD_NUMBER; });
}

// Initialize app
async function init() {
  stampBuildNumber();

  // Setup event listeners first (before data load)
  setupEventListeners();
  setupAIEventListeners();
  setupSettingsEventListeners();
  registerServiceWorker();

  // Handle OAuth callbacks
  let switchToTab = null;

  // Check for Google OAuth callback first
  const googleCallbackHandled = await DriveStorage.handleCallback();
  if (googleCallbackHandled) {
    console.log('Google Drive connected!');
    switchToTab = 'add-stuff'; // Will switch once we have the tab
  }

  // Check for OpenRouter OAuth callback
  const openrouterCallbackHandled = await handleOAuthCallback();
  if (openrouterCallbackHandled) {
    switchToTab = 'ask-ai';
  }

  // Try to refresh Google token silently if we have a stored token (even if expired)
  const hasStoredToken = localStorage.getItem('google_access_token');
  if (hasStoredToken && !DriveStorage.isConnected()) {
    console.log('Token expired, attempting silent refresh...');
    await DriveStorage.refreshTokenIfNeeded();
  }

  // Load data from Google Drive
  await loadPhotoSets();
  await loadInventory();
  // Check if image cache is still valid for this folder
  await DriveStorage.checkCacheValidity();
  renderPhotoGrid();
  populateCategories();

  // Switch to appropriate tab after OAuth
  if (switchToTab) {
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-mode="${switchToTab}"]`).classList.add('active');
    modeContents.forEach(content => {
      content.classList.toggle('active', content.id === `${switchToTab}-mode`);
    });
  }

  // Update connection UI
  updateAIConnectionUI();
  updateGoogleConnectionUI();
  updateAddStuffUI();
}

// Load photo sets data from Google Drive
async function loadPhotoSets() {
  try {
    // Try Google Drive first
    if (DriveStorage.isConnected()) {
      const driveData = await DriveStorage.loadPhotosets();
      if (driveData) {
        photoSets = driveData;
        console.log('Loaded photosets from Google Drive:', photoSets.length);
        return;
      }
    }

    // No data source available - start with empty
    console.log('No photosets data source available');
    photoSets = [];
  } catch (err) {
    console.error('Failed to load photosets:', err);
    photoSets = [];
  }
}

// Load inventory data (from Drive)
async function loadInventory() {
  try {
    // Try Google Drive
    if (DriveStorage.isConnected()) {
      const driveData = await DriveStorage.loadInventory();
      if (driveData) {
        inventory = driveData;
        console.log('Loaded inventory from Google Drive:', inventory.length);
        return;
      }
    }

    // No data source available - start with empty
    console.log('No inventory data source available');
    inventory = [];
  } catch (err) {
    console.error('Failed to load inventory:', err);
    inventory = [];
  }
}

// Render photo grid for visual browsing
function renderPhotoGrid() {
  const emptyState = document.getElementById('photos-empty');
  const photosContent = document.getElementById('photos-content');

  if (photoSets.length === 0) {
    emptyState.style.display = 'block';
    photosContent.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  photosContent.style.display = 'block';

  // Render grid with loading skeletons
  photoGrid.innerHTML = photoSets.map(photo => {
    return `
      <div class="photo-card loading" data-file="${photo.file}" data-box="${photo.box}" data-category="${photo.category}" data-drive-id="${photo.driveId || ''}">
        <span class="box-label">${boxLabel(photo.box)}</span>
        <img src="" alt="${boxLabel(photo.box)} view ${photo.view}" loading="lazy" data-drive-id="${photo.driveId || ''}">
        <div class="label">
          <span class="label-category">${photo.category || 'Tools'}</span>
          ${photo.caption ? `<span class="label-caption">${photo.caption}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Load Drive images asynchronously
  loadDriveImages();
}

// Load images from Google Drive with authentication
async function loadDriveImages() {
  const images = document.querySelectorAll('img[data-drive-id]');

  // Load all images in parallel for speed
  const loadPromises = Array.from(images).map(async (img) => {
    const driveId = img.dataset.driveId;
    if (!driveId) {
      img.closest('.photo-card')?.classList.remove('loading');
      return;
    }

    // Check cache first
    const cached = DriveStorage.imageCache.get(`${driveId}_thumb`);
    if (cached) {
      img.src = cached;
      img.closest('.photo-card')?.classList.remove('loading');
      return;
    }

    // Load from Drive
    try {
      const blobUrl = await DriveStorage.getPhotoBlobUrl(driveId, 'thumb');
      if (blobUrl) {
        img.src = blobUrl;
      }
    } catch (err) {
      console.error('Failed to load image:', driveId, err);
    }
    img.closest('.photo-card')?.classList.remove('loading');
  });

  await Promise.all(loadPromises);
}

// Populate category dropdown
function populateCategories() {
  const categories = [...new Set(inventory.map(item => item.category))];
  categories.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat;
    option.textContent = cat;
    categoryFilter.appendChild(option);
  });
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const mode = tab.dataset.mode;
      modeContents.forEach(content => {
        content.classList.toggle('active', content.id === `${mode}-mode`);
      });
    });
  });

  // Photo grid clicks
  photoGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.photo-card');
    if (card) {
      showPhotoModal(card.dataset.file, card.dataset.box, card.dataset.category);
    }
  });

  // Search input
  searchInput.addEventListener('input', debounce(performSearch, 200));

  // Category filter
  categoryFilter.addEventListener('change', performSearch);

  // Home link in header
  document.getElementById('home-link').addEventListener('click', (e) => {
    e.preventDefault();
    goHome();
  });

  // Modal home links - go back to start
  document.querySelectorAll('.modal-home').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      goHome();
    });
  });

  // Close modals on background click
  [photoModal, itemModal].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Results click
  results.addEventListener('click', (e) => {
    const item = e.target.closest('.result-item');
    if (item) {
      const id = item.dataset.id;
      const inventoryItem = inventory.find(i => i.id === id);
      if (inventoryItem) {
        showItemModal(inventoryItem);
      }
    }
  });

  // Edit item button
  document.getElementById('edit-item-btn').addEventListener('click', () => {
    editCurrentItem();
  });

  // Delete item button
  document.getElementById('delete-item-btn').addEventListener('click', () => {
    deleteCurrentItem();
  });

  // Show box contents button
  document.getElementById('show-box-contents-btn').addEventListener('click', () => {
    if (currentBoxNumber) {
      showBoxContents(currentBoxNumber);
    }
  });

  // Delete photo button
  document.getElementById('delete-photo-btn').addEventListener('click', () => {
    deleteCurrentPhoto();
  });

  // Edit caption button
  document.getElementById('edit-caption-btn').addEventListener('click', () => {
    editPhotoCaption();
  });

  // Edit category button
  document.getElementById('edit-category-btn').addEventListener('click', () => {
    editPhotoCategory();
  });

  document.getElementById('edit-box-name-btn').addEventListener('click', () => {
    editBoxName();
  });

  // AI category suggestion button
  document.getElementById('ai-category-btn').addEventListener('click', () => {
    suggestCategoryWithAI();
  });

  // Show all inventory button
  document.getElementById('show-all-btn').addEventListener('click', () => {
    showAllInventory();
  });

  // Swipe navigation for photo modal
  const modalImage = document.getElementById('modal-image');
  modalImage.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchEndX = touchStartX; // Reset to prevent accidental triggers
  }, { passive: true });

  modalImage.addEventListener('touchmove', (e) => {
    touchEndX = e.touches[0].clientX;
  }, { passive: true });

  modalImage.addEventListener('touchend', () => {
    handleSwipe();
    touchStartX = 0;
    touchEndX = 0;
  }, { passive: true });

  // Keyboard navigation for photo modal
  document.addEventListener('keydown', (e) => {
    if (!photoModal.classList.contains('active')) return;
    if (e.key === 'ArrowLeft') {
      showPrevPhoto();
    } else if (e.key === 'ArrowRight') {
      showNextPhoto();
    } else if (e.key === 'Escape') {
      photoModal.classList.remove('active');
    }
  });
}

// Toggle contents of a specific box
function showBoxContents(boxNumber) {
  const btn = document.getElementById('show-box-contents-btn');
  const existingList = photoModal.querySelector('.inventory-list');

  // Toggle: if list exists, hide it
  if (existingList) {
    existingList.remove();
    btn.textContent = 'Show Box Contents';
    return;
  }

  // Otherwise show the list
  const boxItems = inventory.filter(item => {
    const itemBox = item.photoSet.split('/')[0].replace(/[a-z]/g, '');
    return itemBox === String(boxNumber);
  });

  const listHtml = renderInventoryList(boxItems);
  btn.insertAdjacentHTML('afterend', listHtml);
  btn.textContent = 'Hide Box Contents';
}

// Show all inventory
function showAllInventory() {
  // Switch to search mode and clear filters to show all
  tabs.forEach(t => t.classList.remove('active'));
  document.querySelector('[data-mode="search"]').classList.add('active');

  modeContents.forEach(content => {
    content.classList.toggle('active', content.id === 'search-mode');
  });

  searchInput.value = '';
  categoryFilter.value = '';
  renderResults(inventory, true);
}

// Render inventory list HTML
function renderInventoryList(items) {
  if (items.length === 0) {
    return '<div class="inventory-list"><p class="no-results">No items in this box</p></div>';
  }

  const itemList = items.map(item => {
    const brand = item.brand && item.brand !== 'Unknown' ? ` (${item.brand})` : '';
    return `<li>${item.item}${brand}</li>`;
  }).join('');

  return `<div class="inventory-list"><ul>${itemList}</ul></div>`;
}

// Show photo modal with box number
async function showPhotoModal(file, box, category, driveId) {
  currentPhotoIndex = photoSets.findIndex(p => p.file === file);
  currentBoxNumber = box;
  document.getElementById('modal-box-number').textContent = boxLabel(box);
  const modalImage = document.getElementById('modal-image');
  const photo = photoSets[currentPhotoIndex];

  // Load image with auth if from Drive
  if (photo && photo.driveId) {
    modalImage.src = ''; // Clear while loading
    const blobUrl = await DriveStorage.getPhotoBlobUrl(photo.driveId, 'full');
    modalImage.src = blobUrl || '';
  } else {
    modalImage.src = `images/${file}`;
  }

  modalImage.style.display = '';
  document.getElementById('modal-category').textContent = category;

  // Display caption
  const captionEl = document.getElementById('modal-caption');
  const captionContainer = document.querySelector('.modal-caption-container');
  if (photo && photo.caption) {
    captionEl.textContent = photo.caption;
    captionContainer.style.display = '';
  } else {
    captionEl.textContent = 'Add a caption...';
    captionEl.style.fontStyle = 'italic';
    captionContainer.style.display = '';
  }

  // Show edit button only if connected to Drive
  const editCaptionBtn = document.getElementById('edit-caption-btn');
  editCaptionBtn.style.display = DriveStorage.isConnected() ? '' : 'none';

  // Show category edit buttons only if connected to Drive
  const editCategoryBtn = document.getElementById('edit-category-btn');
  const aiCategoryBtn = document.getElementById('ai-category-btn');
  const editBoxNameBtn = document.getElementById('edit-box-name-btn');
  editCategoryBtn.style.display = DriveStorage.isConnected() ? '' : 'none';
  editBoxNameBtn.style.display = DriveStorage.isConnected() ? '' : 'none';
  aiCategoryBtn.style.display = (DriveStorage.isConnected() && localStorage.getItem('openrouter_key')) ? '' : 'none';

  const boxContentsBtn = document.getElementById('show-box-contents-btn');
  boxContentsBtn.style.display = '';
  boxContentsBtn.textContent = 'Show Box Contents';
  // Clear any previous inventory list
  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();
  photoModal.classList.add('active');
}

// Navigate to next photo
function showNextPhoto() {
  currentPhotoIndex = (currentPhotoIndex + 1) % photoSets.length;
  updatePhotoDisplay();
}

// Navigate to previous photo
function showPrevPhoto() {
  currentPhotoIndex = (currentPhotoIndex - 1 + photoSets.length) % photoSets.length;
  updatePhotoDisplay();
}

// Update the photo display with fade
async function updatePhotoDisplay() {
  const photo = photoSets[currentPhotoIndex];
  const img = document.getElementById('modal-image');
  currentBoxNumber = photo.box;

  img.style.opacity = '0.5';

  // Load image with auth if from Drive
  if (photo.driveId) {
    const blobUrl = await DriveStorage.getPhotoBlobUrl(photo.driveId, 'full');
    img.src = blobUrl || '';
  } else {
    img.src = `images/${photo.file}`;
  }
  img.onload = () => { img.style.opacity = '1'; };

  document.getElementById('modal-box-number').textContent = boxLabel(photo.box);
  document.getElementById('modal-category').textContent = photo.category;

  // Update caption
  const captionEl = document.getElementById('modal-caption');
  if (photo.caption) {
    captionEl.textContent = photo.caption;
    captionEl.style.fontStyle = 'normal';
  } else {
    captionEl.textContent = 'Add a caption...';
    captionEl.style.fontStyle = 'italic';
  }

  // Clear inventory list when navigating
  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();

  // Reset button text
  document.getElementById('show-box-contents-btn').textContent = 'Show Box Contents';
}

// Handle swipe gesture
function handleSwipe() {
  const swipeThreshold = 50;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > swipeThreshold) {
    if (diff > 0) {
      // Swipe left - next photo
      showNextPhoto();
    } else {
      // Swipe right - previous photo
      showPrevPhoto();
    }
  }
}

// Currently displayed item for editing
let currentItem = null;

// Show item detail modal
async function showItemModal(item) {
  currentItem = item;
  document.getElementById('item-name').textContent = item.item;

  const photos = item.photoSet.split('/');
  const box = photos[0].replace(/[a-z]/g, '');

  document.getElementById('item-details').innerHTML = `
    <p><strong>Brand:</strong> ${item.brand || 'Unknown'}</p>
    ${item.model ? `<p><strong>Model:</strong> ${item.model}</p>` : ''}
    <p><strong>Type:</strong> ${item.type}</p>
    <p><strong>Category:</strong> ${item.category}</p>
    ${item.notes ? `<p><strong>Notes:</strong> ${item.notes}</p>` : ''}
    <p><strong>Location:</strong> ${boxLabel(box)}</p>
  `;

  // Create placeholder images
  const photosContainer = document.getElementById('item-photos');
  photosContainer.innerHTML = photos.map((p, i) =>
    `<img src="" alt="${boxLabel(box)}" loading="lazy" data-photo-ref="${p}" id="item-photo-${i}">`
  ).join('');

  // Load photos from Drive with auth
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const ps = photoSets.find(ps => ps.file === `${p}.jpg`);
    const img = document.getElementById(`item-photo-${i}`);

    if (ps && ps.driveId) {
      const blobUrl = await DriveStorage.getPhotoBlobUrl(ps.driveId, 'full');
      if (blobUrl) img.src = blobUrl;
    } else {
      img.src = `images/${p}.jpg`;
    }
  }

  // Show edit/delete buttons if connected to Drive
  const actionsDiv = document.getElementById('item-actions');
  if (DriveStorage.isConnected()) {
    actionsDiv.style.display = 'block';
  } else {
    actionsDiv.style.display = 'none';
  }

  itemModal.classList.add('active');
}

// Edit current item
async function editCurrentItem() {
  if (!currentItem) return;

  const newName = prompt('Item name:', currentItem.item);
  if (newName === null) return;

  const newBrand = prompt('Brand:', currentItem.brand || '');
  if (newBrand === null) return;

  const newModel = prompt('Model:', currentItem.model || '');
  if (newModel === null) return;

  const newType = prompt('Type (e.g., cordless, manual, pneumatic):', currentItem.type || '');
  if (newType === null) return;

  const newNotes = prompt('Notes:', currentItem.notes || '');
  if (newNotes === null) return;

  // Update the item
  currentItem.item = newName;
  currentItem.brand = newBrand;
  currentItem.model = newModel;
  currentItem.type = newType;
  currentItem.notes = newNotes;

  // Save to Drive
  try {
    await DriveStorage.saveInventory(inventory);
    alert('Item updated!');
    itemModal.classList.remove('active');
    performSearch(); // Refresh results
  } catch (err) {
    console.error('Failed to save:', err);
    alert('Failed to save: ' + err.message);
  }
}

// Delete current item
async function deleteCurrentItem() {
  if (!currentItem) return;

  if (!confirm(`Delete "${currentItem.item}"?`)) return;

  // Remove from inventory
  const idx = inventory.findIndex(i => i.id === currentItem.id);
  if (idx !== -1) {
    inventory.splice(idx, 1);
  }

  // Save to Drive
  try {
    await DriveStorage.saveInventory(inventory);
    alert('Item deleted!');
    currentItem = null;
    itemModal.classList.remove('active');
    performSearch(); // Refresh results
  } catch (err) {
    console.error('Failed to delete:', err);
    alert('Failed to delete: ' + err.message);
  }
}

// Delete current photo
async function deleteCurrentPhoto() {
  if (currentPhotoIndex < 0 || currentPhotoIndex >= photoSets.length) return;

  const photo = photoSets[currentPhotoIndex];
  if (!photo) return;

  const photoSetName = photo.file.replace('.jpg', '');

  // Find items that reference this photo
  // photoSet can be "3a" (single) or "3a/3b" (multiple photos)
  const affectedItems = inventory.filter(item => {
    const refs = item.photoSet.split('/');
    return refs.includes(photoSetName);
  });

  // Categorize: items to delete vs items to update
  const itemsToDelete = [];
  const itemsToUpdate = [];

  for (const item of affectedItems) {
    const refs = item.photoSet.split('/');
    if (refs.length === 1) {
      // Only photo reference - item will be deleted
      itemsToDelete.push(item);
    } else {
      // Multiple photo references - just remove this one
      itemsToUpdate.push(item);
    }
  }

  let confirmMsg = `Delete photo "${photo.file}" (${boxLabel(photo.box)})?`;
  if (itemsToDelete.length > 0) {
    confirmMsg += `\n\n${itemsToDelete.length} item(s) will be deleted (only linked to this photo).`;
  }
  if (itemsToUpdate.length > 0) {
    confirmMsg += `\n\n${itemsToUpdate.length} item(s) will be updated (linked to other photos too).`;
  }

  if (!confirm(confirmMsg)) return;

  try {
    // Delete photo file from Drive if it has a driveId
    if (photo.driveId) {
      await DriveStorage.deleteFile(photo.driveId);
    }

    // Remove from photoSets
    photoSets.splice(currentPhotoIndex, 1);
    await DriveStorage.savePhotosets(photoSets);

    // Handle inventory changes
    let inventoryChanged = false;

    // Delete items that only had this photo
    for (const item of itemsToDelete) {
      const idx = inventory.findIndex(i => i.id === item.id);
      if (idx !== -1) {
        inventory.splice(idx, 1);
        inventoryChanged = true;
      }
    }

    // Update items that have other photos - remove this photo from their photoSet
    for (const item of itemsToUpdate) {
      const refs = item.photoSet.split('/').filter(r => r !== photoSetName);
      item.photoSet = refs.join('/');
      inventoryChanged = true;
    }

    if (inventoryChanged) {
      await DriveStorage.saveInventory(inventory);
    }

    alert('Photo deleted!');
    photoModal.classList.remove('active');
    renderPhotoGrid(); // Refresh grid
  } catch (err) {
    console.error('Failed to delete photo:', err);
    alert('Failed to delete: ' + err.message);
  }
}

// Edit photo caption
async function editPhotoCaption() {
  if (currentPhotoIndex < 0 || currentPhotoIndex >= photoSets.length) return;

  const photo = photoSets[currentPhotoIndex];
  if (!photo) return;

  const currentCaption = photo.caption || '';
  const newCaption = prompt('Enter caption for this photo:', currentCaption);

  if (newCaption === null) return; // User cancelled

  try {
    // Update the caption
    photo.caption = newCaption.trim();

    // Save to Drive
    await DriveStorage.savePhotosets(photoSets);

    // Update the modal display
    const captionEl = document.getElementById('modal-caption');
    if (photo.caption) {
      captionEl.textContent = photo.caption;
      captionEl.style.fontStyle = 'normal';
    } else {
      captionEl.textContent = 'Add a caption...';
      captionEl.style.fontStyle = 'italic';
    }

    // Refresh the grid to show updated caption
    renderPhotoGrid();
  } catch (err) {
    console.error('Failed to save caption:', err);
    alert('Failed to save caption: ' + err.message);
  }
}

// Edit category for current photo
async function editPhotoCategory(suggestedCategory = null) {
  if (currentPhotoIndex < 0 || currentPhotoIndex >= photoSets.length) return;

  const photo = photoSets[currentPhotoIndex];
  if (!photo) return;

  const currentCategory = photo.category || 'Tools';
  const promptText = suggestedCategory
    ? `AI suggests: "${suggestedCategory}"\n\nEdit category (or press OK to accept):`
    : 'Enter category for this photo:';
  const defaultValue = suggestedCategory || currentCategory;

  const newCategory = prompt(promptText, defaultValue);

  if (newCategory === null) return; // User cancelled
  if (!newCategory.trim()) return; // Empty not allowed

  try {
    const trimmedCategory = newCategory.trim();

    // Update the category
    photo.category = trimmedCategory;

    // Save to Drive
    await DriveStorage.savePhotosets(photoSets);

    // Update the modal display
    document.getElementById('modal-category').textContent = trimmedCategory;

    // Refresh the grid to show updated category
    renderPhotoGrid();

    // Check for other photos in the same box
    const boxNum = photo.box;
    const otherPhotosInBox = photoSets.filter(p => p.box === boxNum && p.file !== photo.file);

    if (otherPhotosInBox.length > 0) {
      const updateOthers = confirm(`Apply "${trimmedCategory}" to ${otherPhotosInBox.length} other photo(s) in ${boxLabel(boxNum)}?`);
      if (updateOthers) {
        otherPhotosInBox.forEach(p => p.category = trimmedCategory);
        await DriveStorage.savePhotosets(photoSets);
        renderPhotoGrid();
      }
    }

    // Also update matching inventory items if user wants
    const boxItems = inventory.filter(item => {
      const itemBox = item.photoSet.split('/')[0].replace(/[a-z]/g, '');
      return itemBox === String(boxNum);
    });
    if (boxItems.length > 0) {
      const updateItems = confirm(`Update category for ${boxItems.length} inventory item(s) in ${boxLabel(boxNum)} too?`);
      if (updateItems) {
        boxItems.forEach(item => item.category = trimmedCategory);
        await DriveStorage.saveInventory(inventory);
        populateCategories();
      }
    }
  } catch (err) {
    console.error('Failed to save category:', err);
    alert('Failed to save category: ' + err.message);
  }
}

// Rename the box shown in the photo modal. The prefix is a property of the
// box, so this rewrites every photoset row for that box.
async function editBoxName() {
  if (currentPhotoIndex < 0 || currentPhotoIndex >= photoSets.length) return;
  const photo = photoSets[currentPhotoIndex];

  const current = boxPrefixOf(photo.box);
  const entered = prompt(
    'Box name prefix? It gets numbered automatically among boxes sharing it.\n' +
    `e.g. "GardenBox" shows as "GardenBox 1". Use "${DEFAULT_BOX_PREFIX}" for the default.`,
    current
  );
  if (entered === null) return; // cancelled

  const trimmed = entered.trim() || DEFAULT_BOX_PREFIX;
  if (trimmed === current) return;

  try {
    const ok = await setBoxPrefix(photo.box, trimmed);
    if (!ok) {
      alert('Could not rename: no photos found for this box.');
      return;
    }
    document.getElementById('modal-box-number').textContent = boxLabel(photo.box);
    renderPhotoGrid();
  } catch (err) {
    console.error('Failed to rename box:', err);
    alert('Failed to rename box: ' + err.message);
  }
}

// Suggest category using AI vision
async function suggestCategoryWithAI() {
  if (currentPhotoIndex < 0 || currentPhotoIndex >= photoSets.length) return;

  const photo = photoSets[currentPhotoIndex];
  if (!photo || !photo.driveId) {
    alert('This photo is not available for AI analysis.');
    return;
  }

  const apiKey = localStorage.getItem('openrouter_key');
  if (!apiKey) {
    alert('Please connect OpenRouter in Settings to use AI suggestions.');
    return;
  }

  // Show loading state
  const aiBtn = document.getElementById('ai-category-btn');
  const originalText = aiBtn.innerHTML;
  aiBtn.innerHTML = '...';
  aiBtn.disabled = true;

  try {
    // Get the image as base64
    const blobUrl = await DriveStorage.getPhotoBlobUrl(photo.driveId, 'full');
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    // Call vision API
    const aiResponse = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': CALLBACK_URL,
        'X-Title': 'Trouve-Tout'
      },
      body: JSON.stringify({
        model: MODELS.vision,
        messages: [
          {
            role: 'system',
            content: `You are helping categorize tool photos for an inventory app. Look at the image and suggest a short, descriptive category name (2-4 words) that describes what types of tools are shown.

Examples of good category names:
- "Nail Guns & Fasteners"
- "Hand Tools & Misc"
- "Sanders & Grinder"
- "Saws & Grinders"
- "Cordless Power Tools"
- "Woodworking Clamps"
- "Electrical Tools"

Respond with ONLY the category name, nothing else.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What category best describes the tools in this image?' },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ],
        max_tokens: 50
      })
    });

    if (!aiResponse.ok) {
      throw new Error(`API error: ${aiResponse.status}`);
    }

    const data = await aiResponse.json();
    const suggestedCategory = data.choices?.[0]?.message?.content?.trim() || '';

    if (suggestedCategory) {
      // Call editPhotoCategory with the suggestion
      editPhotoCategory(suggestedCategory);
    } else {
      alert('AI could not suggest a category. Please enter one manually.');
    }
  } catch (err) {
    console.error('AI category suggestion failed:', err);
    alert('AI suggestion failed: ' + err.message);
  } finally {
    aiBtn.innerHTML = originalText;
    aiBtn.disabled = false;
  }
}

// Perform search
function performSearch() {
  const query = searchInput.value.toLowerCase().trim();
  const category = categoryFilter.value;

  let filtered = inventory;

  if (category) {
    filtered = filtered.filter(item => item.category === category);
  }

  if (query) {
    filtered = filtered.filter(item => {
      const searchable = [
        item.item,
        item.brand,
        item.model,
        item.notes,
        item.type
      ].filter(Boolean).join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }

  renderResults(filtered);
}

// Render search results
function renderResults(items, grouped = false) {
  if (items.length === 0) {
    results.innerHTML = '<p class="no-results">No items found</p>';
    return;
  }

  if (grouped) {
    // Group by box number
    const byBox = {};
    items.forEach(item => {
      const box = item.photoSet.split('/')[0].replace(/[a-z]/g, '');
      if (!byBox[box]) byBox[box] = [];
      byBox[box].push(item);
    });

    results.innerHTML = Object.keys(byBox).sort((a, b) => a - b).map(box => {
      const boxItems = byBox[box];
      const itemList = boxItems.map(item => {
        const brand = item.brand && item.brand !== 'Unknown' ? ` (${item.brand})` : '';
        return `<li>${item.item}${brand}</li>`;
      }).join('');
      return `
        <div class="box-group">
          <h3>${boxLabel(box)}</h3>
          <ul>${itemList}</ul>
        </div>
      `;
    }).join('');
    return;
  }

  results.innerHTML = items.map(item => {
    const box = item.photoSet.split('/')[0].replace(/[a-z]/g, '');
    return `
      <div class="result-item" data-id="${item.id}">
        <h3>${item.item}</h3>
        <div class="meta">
          <span>${item.brand || 'Unknown'}</span>
          ${item.model ? `<span>${item.model}</span>` : ''}
        </div>
        ${item.notes ? `<div class="notes">${item.notes}</div>` : ''}
        <span class="box-label">${boxLabel(box)}</span>
      </div>
    `;
  }).join('');
}

// Debounce helper
function debounce(fn, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, args), delay);
  };
}

// ==================== OpenRouter OAuth PKCE ====================

// Generate random code verifier for PKCE
function generateCodeVerifier() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Generate code challenge from verifier (S256)
async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Start OAuth flow - redirect to OpenRouter
async function startOAuthFlow() {
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem('openrouter_code_verifier', codeVerifier);

  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const authUrl = `${OPENROUTER_AUTH_URL}?callback_url=${encodeURIComponent(CALLBACK_URL)}&code_challenge=${codeChallenge}&code_challenge_method=S256`;
  window.location.href = authUrl;
}

// Handle OAuth callback - exchange code for API key
async function handleOAuthCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (!code) return false;

  const codeVerifier = sessionStorage.getItem('openrouter_code_verifier');
  if (!codeVerifier) {
    console.error('No code verifier found');
    return false;
  }

  try {
    const response = await fetch(OPENROUTER_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256'
      })
    });

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();
    if (data.key) {
      localStorage.setItem('openrouter_key', data.key);
      sessionStorage.removeItem('openrouter_code_verifier');
      // Clean up URL
      window.history.replaceState({}, document.title, CALLBACK_URL);
      return true;
    }
  } catch (err) {
    console.error('OAuth callback error:', err);
  }

  return false;
}

// Check if connected to OpenRouter
function isConnected() {
  return !!localStorage.getItem('openrouter_key');
}

// Disconnect from OpenRouter
function disconnect() {
  localStorage.removeItem('openrouter_key');
  chatHistory = [];
  updateAIConnectionUI();
}

// ==================== Google Drive Storage ====================

// Show an OAuth failure in the Settings > Google Drive status line.
// Without this, a failed authorization only reached the console and the
// UI just sat on "Not connected" with no explanation.
function showGoogleError(message) {
  // Silent startup refreshes are expected to fail once the hourly token
  // lapses; only a connect the user actually clicked should show an error.
  if (!DriveStorage.userInitiatedAuth) return;
  const status = document.getElementById('google-status');
  if (!status) return;
  status.textContent = `Connection failed: ${message}`;
  status.className = 'settings-status error';
}

const DriveStorage = {
  FOLDER_NAME: 'Trouve-Tout',
  folderId: null,
  tokenClient: null,
  // true only while a connect the user clicked is in flight
  userInitiatedAuth: false,
  // settles an in-flight silent refresh (set by refreshTokenIfNeeded)
  _settleRefresh: null,

  // Check if connected to Google Drive
  isConnected() {
    const token = localStorage.getItem('google_access_token');
    const expiry = localStorage.getItem('google_token_expiry');
    // Check if token exists and hasn't expired
    return token && expiry && Date.now() < parseInt(expiry);
  },

  // Get access token
  getAccessToken() {
    return localStorage.getItem('google_access_token');
  },

  // Initialize the Google Identity Services token client
  initTokenClient() {
    if (this.tokenClient) return;

    if (typeof google === 'undefined' || !google.accounts) {
      console.error('Google Identity Services not loaded yet');
      return;
    }

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      // GIS defaults this to true, which merges every scope previously
      // granted to this client ID into the request. This client is shared
      // with an older YouTube app, and Google rejects drive.file and
      // youtube.readonly in a single request ("scopes that cannot be
      // requested together", error 400). We only ever need drive.file.
      include_granted_scopes: false,
      error_callback: (err) => {
        console.error('Google OAuth error:', err);
        // A blocked or closed popup reports here and never reaches callback,
        // so a silent refresh waiting on it has to be released.
        if (this._settleRefresh) this._settleRefresh(false);
        showGoogleError(err && (err.message || err.type) ? (err.message || err.type) : 'Authorization failed');
      },
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('Google OAuth error:', tokenResponse.error);
          showGoogleError(tokenResponse.error_description || tokenResponse.error);
          return;
        }

        // Store the token
        localStorage.setItem('google_access_token', tokenResponse.access_token);
        localStorage.setItem('google_token_expiry', Date.now() + (tokenResponse.expires_in * 1000));

        console.log('Google Drive connected successfully!');

        // Load data from Drive
        try {
          await loadPhotoSets();
          await loadInventory();
          // Check if image cache is for this folder (clear if different account)
          await DriveStorage.checkCacheValidity();
          renderPhotoGrid();
          populateCategories();
          console.log(`Loaded ${photoSets.length} photos, ${inventory.length} items from Drive`);
        } catch (err) {
          console.error('Failed to load data from Drive:', err);
        }

        // Update UI
        updateGoogleConnectionUI();
        updateAddStuffUI();

        // Switch to Add Stuff tab
        const tabs = document.querySelectorAll('.tab');
        const modeContents = document.querySelectorAll('.mode-content');
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelector('[data-mode="add-stuff"]').classList.add('active');
        modeContents.forEach(content => {
          content.classList.toggle('active', content.id === 'add-stuff-mode');
        });
      }
    });
  },

  // Start Google OAuth flow using Google Identity Services
  async startAuthFlow() {
    this.initTokenClient();

    if (!this.tokenClient) {
      alert('Google Sign-In is still loading. Please try again in a moment.');
      return;
    }

    // Request an access token
    this.userInitiatedAuth = true;
    this.tokenClient.requestAccessToken({ prompt: 'consent' });
  },

  // Handle OAuth callback - not needed with GIS (it uses popup/redirect handled internally)
  async handleCallback() {
    // GIS handles callbacks internally, no manual handling needed
    return false;
  },

  // Check if token needs refresh - attempt silent re-auth if expired
  async refreshTokenIfNeeded() {
    if (this.isConnected()) {
      return true;
    }

    // Token expired - try silent re-authentication
    // This will work if user has previously granted consent
    return new Promise((resolve) => {
      this.initTokenClient();

      if (!this.tokenClient) {
        resolve(false);
        return;
      }

      // Set up a one-time callback for this refresh attempt
      const originalCallback = this.tokenClient.callback;

      // This promise MUST always settle. requestAccessToken opens a popup,
      // and a popup opened without a user gesture is blocked by default -
      // in which case it neither throws nor invokes the callback. init()
      // awaits this, so an unsettled promise hung startup forever: the
      // photo grid, the category list and the connection status never
      // rendered, leaving the app stuck on "No photos yet".
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this._settleRefresh = null;
        if (this.tokenClient) this.tokenClient.callback = originalCallback;
        resolve(value);
      };
      const timer = setTimeout(() => {
        console.log('Silent refresh timed out, user needs to reconnect');
        finish(false);
      }, SILENT_REFRESH_TIMEOUT_MS);
      // let error_callback (popup blocked / closed) settle us too
      this._settleRefresh = finish;

      this.tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse.error) {
          console.log('Silent refresh failed, user needs to reconnect');
          finish(false);
          return;
        }

        // Store the new token
        localStorage.setItem('google_access_token', tokenResponse.access_token);
        localStorage.setItem('google_token_expiry', Date.now() + (tokenResponse.expires_in * 1000));
        console.log('Token silently refreshed');
        finish(true);
      };

      // Request new token without consent prompt (silent if already authorized)
      try {
        this.userInitiatedAuth = false;
        this.tokenClient.requestAccessToken({ prompt: '' });
      } catch (err) {
        console.log('Silent refresh error:', err);
        finish(false);
      }
    });
  },

  // Disconnect from Google Drive
  disconnect() {
    const token = localStorage.getItem('google_access_token');
    if (token && google?.accounts?.oauth2) {
      google.accounts.oauth2.revoke(token, () => {
        console.log('Google token revoked');
      });
    }
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_token_expiry');
    localStorage.removeItem('google_drive_folder_id');
    this.folderId = null;
    this.clearImageCache();
  },

  // Make authenticated API request
  async apiRequest(url, options = {}) {
    const valid = await this.refreshTokenIfNeeded();
    if (!valid) {
      throw new Error('Google Drive session expired. Please reconnect.');
    }
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Not connected to Google Drive');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${response.status}`);
    }

    return response;
  },

  // Initialize - find or create app folder
  async init() {
    // Check cached folder ID first
    const cachedId = localStorage.getItem('google_drive_folder_id');
    if (cachedId) {
      this.folderId = cachedId;
      return this.folderId;
    }

    // Search for existing folder
    const query = `name='${this.FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const searchUrl = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const response = await this.apiRequest(searchUrl);
    const data = await response.json();

    if (data.files && data.files.length > 0) {
      this.folderId = data.files[0].id;
    } else {
      // Create folder
      const createResponse = await this.apiRequest(`${GOOGLE_DRIVE_API}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      const folder = await createResponse.json();
      this.folderId = folder.id;
    }

    localStorage.setItem('google_drive_folder_id', this.folderId);
    return this.folderId;
  },

  // Find a file by name in the app folder
  async findFile(filename) {
    await this.init();
    const query = `name='${filename}' and '${this.folderId}' in parents and trashed=false`;
    const url = `${GOOGLE_DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

    const response = await this.apiRequest(url);
    const data = await response.json();

    return data.files && data.files.length > 0 ? data.files[0] : null;
  },

  // Read a JSON file from Drive
  async readJsonFile(filename) {
    const file = await this.findFile(filename);
    if (!file) return null;

    const response = await this.apiRequest(
      `${GOOGLE_DRIVE_API}/files/${file.id}?alt=media`
    );
    return await response.json();
  },

  // Write a JSON file to Drive (create or update)
  async writeJsonFile(filename, data) {
    await this.init();
    const existing = await this.findFile(filename);
    const content = JSON.stringify(data, null, 2);
    const blob = new Blob([content], { type: 'application/json' });

    if (existing) {
      // Update existing file
      await this.apiRequest(
        `${GOOGLE_UPLOAD_API}/files/${existing.id}?uploadType=media`,
        {
          method: 'PATCH',
          body: blob
        }
      );
    } else {
      // Create new file with multipart upload
      const metadata = {
        name: filename,
        parents: [this.folderId]
      };

      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', blob);

      await this.apiRequest(
        `${GOOGLE_UPLOAD_API}/files?uploadType=multipart`,
        {
          method: 'POST',
          body: form
        }
      );
    }
  },

  // Upload a photo to Drive
  async uploadPhoto(file, filename) {
    await this.init();

    const metadata = {
      name: filename,
      parents: [this.folderId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const response = await this.apiRequest(
      `${GOOGLE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,webContentLink`,
      {
        method: 'POST',
        body: form
      }
    );

    return await response.json();
  },

  // Cache for blob URLs (in-memory, fast)
  imageCache: new Map(),

  // IndexedDB for persistent image cache
  dbName: 'trouve-tout-images',
  dbVersion: 1,
  db: null,

  // Open IndexedDB connection
  async openDB() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('images')) {
          db.createObjectStore('images', { keyPath: 'id' });
        }
      };
    });
  },

  // Get image from IndexedDB
  async getFromDB(key) {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('images', 'readonly');
        const store = tx.objectStore('images');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result?.blob || null);
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  // Save image to IndexedDB
  async saveToDB(key, blob) {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.put({ id: key, blob, timestamp: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  // Clear IndexedDB cache
  async clearDB() {
    try {
      const db = await this.openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('images', 'readwrite');
        const store = tx.objectStore('images');
        store.clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch {
      return false;
    }
  },

  // Get photo as blob URL (checks IndexedDB first, then fetches from Drive)
  async getPhotoBlobUrl(fileId, size = 'full') {
    const cacheKey = `${fileId}_${size}`;

    // 1. Check in-memory cache (fastest)
    if (this.imageCache.has(cacheKey)) {
      return this.imageCache.get(cacheKey);
    }

    // 2. Check IndexedDB (fast, persists across sessions)
    const cachedBlob = await this.getFromDB(cacheKey);
    if (cachedBlob) {
      const blobUrl = URL.createObjectURL(cachedBlob);
      this.imageCache.set(cacheKey, blobUrl);
      return blobUrl;
    }

    // 3. Fetch from Drive (slow, but caches for next time)
    try {
      const token = this.getAccessToken();
      if (!token) return null;

      const response = await fetch(
        `${GOOGLE_DRIVE_API}/files/${fileId}?alt=media`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) {
        console.error('Failed to fetch image:', response.status);
        return null;
      }

      const blob = await response.blob();

      // Save to IndexedDB for next session
      this.saveToDB(cacheKey, blob);

      const blobUrl = URL.createObjectURL(blob);
      this.imageCache.set(cacheKey, blobUrl);
      return blobUrl;
    } catch (err) {
      console.error('Error fetching image:', err);
      return null;
    }
  },

  // Clear image cache (only in-memory, keep IndexedDB for fast reload)
  clearImageCache() {
    for (const url of this.imageCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.imageCache.clear();
    // Don't clear IndexedDB - images are still valid for this account
  },

  // Clear IndexedDB if switching to different Drive folder
  async checkCacheValidity() {
    const cachedFolderId = localStorage.getItem('image_cache_folder_id');
    const currentFolderId = localStorage.getItem('google_drive_folder_id');

    if (cachedFolderId && currentFolderId && cachedFolderId !== currentFolderId) {
      console.log('Different Drive folder detected, clearing image cache');
      await this.clearDB();
    }

    if (currentFolderId) {
      localStorage.setItem('image_cache_folder_id', currentFolderId);
    }
  },

  // Delete a file from Drive
  async deleteFile(fileId) {
    await this.apiRequest(`${GOOGLE_DRIVE_API}/files/${fileId}`, {
      method: 'DELETE'
    });
  },

  // Load inventory from Drive
  async loadInventory() {
    return await this.readJsonFile('inventory.json') || [];
  },

  // Save inventory to Drive
  async saveInventory(data) {
    await this.writeJsonFile('inventory.json', data);
  },

  // Load photosets from Drive
  async loadPhotosets() {
    return await this.readJsonFile('photosets.json') || [];
  },

  // Save photosets to Drive
  async savePhotosets(data) {
    await this.writeJsonFile('photosets.json', data);
  }
};

// Update Google Drive connection UI
function updateGoogleConnectionUI() {
  const connectBtn = document.getElementById('connect-google-btn');
  const disconnectBtn = document.getElementById('google-disconnect-btn');
  const status = document.getElementById('google-status');

  if (!connectBtn) return; // UI not present yet

  if (DriveStorage.isConnected()) {
    connectBtn.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = '';
    if (status) {
      status.textContent = 'Connected to Google Drive';
      status.className = 'settings-status success';
    }
  } else {
    connectBtn.style.display = '';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    if (status) {
      status.textContent = 'Not connected';
      status.className = 'settings-status';
    }
  }
}

// Update AI section UI based on connection status
function updateAIConnectionUI() {
  const notConnected = document.getElementById('ai-not-connected');
  const connected = document.getElementById('ai-connected');

  if (isConnected()) {
    notConnected.style.display = 'none';
    connected.style.display = 'block';
  } else {
    notConnected.style.display = 'block';
    connected.style.display = 'none';
  }
}

// Chat history for conversation context
let chatHistory = [];

// Add message to chat UI
function addChatMessage(content, role, isError = false) {
  const messagesContainer = document.getElementById('chat-messages');

  // Remove welcome message if present
  const welcome = messagesContainer.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}${isError ? ' error' : ''}`;
  messageDiv.textContent = content;
  messagesContainer.appendChild(messageDiv);

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  return messageDiv;
}

// Remove thinking message
function removeThinkingMessage() {
  const messagesContainer = document.getElementById('chat-messages');
  const thinking = messagesContainer.querySelector('.chat-message.thinking');
  if (thinking) thinking.remove();
}

// Clear chat history
function clearChat() {
  chatHistory = [];
  const messagesContainer = document.getElementById('chat-messages');
  messagesContainer.innerHTML = `
    <div class="chat-welcome">
      <p>Ask me anything about your tool inventory!</p>
      <p class="ai-examples">"Where's my belt sander?" • "What nailers do I have?"</p>
    </div>
  `;
}

// Render follow-up question suggestions
function renderFollowUps(questions) {
  const messagesContainer = document.getElementById('chat-messages');

  // Remove any existing follow-ups
  const existing = messagesContainer.querySelector('.follow-ups');
  if (existing) existing.remove();

  const followUpDiv = document.createElement('div');
  followUpDiv.className = 'follow-ups';
  followUpDiv.innerHTML = questions.map(q =>
    `<button class="follow-up-btn">${q}</button>`
  ).join('');

  messagesContainer.appendChild(followUpDiv);

  // Add click handlers
  followUpDiv.querySelectorAll('.follow-up-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      followUpDiv.remove();
      askAI(btn.textContent);
    });
  });

  // Scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Ask AI about inventory (with conversation history)
async function askAI(question) {
  const apiKey = localStorage.getItem('openrouter_key');
  if (!apiKey) {
    addChatMessage('Not connected to OpenRouter. Please connect first.', 'assistant', true);
    return;
  }

  const input = document.getElementById('ai-input');
  const sendBtn = document.getElementById('ai-ask-btn');

  // Disable input while processing
  input.disabled = true;
  sendBtn.disabled = true;

  // Remove any existing follow-ups
  const existingFollowUps = document.querySelector('.follow-ups');
  if (existingFollowUps) existingFollowUps.remove();

  // Add user message to UI
  addChatMessage(question, 'user');

  // Add to history
  chatHistory.push({ role: 'user', content: question });

  // Show thinking indicator
  addChatMessage('Thinking...', 'thinking');

  // Build context with inventory
  const inventoryContext = JSON.stringify(inventory, null, 2);

  const systemPrompt = `You are an assistant for a tool inventory app called Trouve-Tout.
The user has tools stored in numbered boxes. Here is their complete inventory:

${inventoryContext}

Rules:
1. Be terse. Just list items with box numbers. No intro, no summary.
2. ALWAYS end with exactly 3 follow-up questions starting with "? "

Example response:
- Circular Saw (Box 4)
- Coping Saw (Box 4)
? What brand is the circular saw?
? Show me all saws
? What else is in box 4?`;

  // Build messages array with history (limit to last 10 exchanges to avoid token limits)
  const recentHistory = chatHistory.slice(-20);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...recentHistory
  ];

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': CALLBACK_URL,
        'X-Title': 'Trouve-Tout'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        messages: messages
      })
    });

    removeThinkingMessage();

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const rawAnswer = data.choices?.[0]?.message?.content || 'No response received';

    // Parse out follow-up questions (lines starting with "? ")
    const lines = rawAnswer.split('\n');
    const followUps = [];
    const answerLines = [];

    for (const line of lines) {
      if (line.startsWith('? ')) {
        followUps.push(line.slice(2).trim());
      } else {
        answerLines.push(line);
      }
    }

    const answer = answerLines.join('\n').trim();

    // Add to history and UI
    chatHistory.push({ role: 'assistant', content: answer });
    addChatMessage(answer, 'assistant');

    // Render follow-up suggestions
    if (followUps.length > 0) {
      renderFollowUps(followUps);
    }

  } catch (err) {
    console.error('AI query error:', err);
    removeThinkingMessage();
    addChatMessage(`Error: ${err.message}`, 'assistant', true);
    // Remove the failed exchange from history
    chatHistory.pop();
  }

  // Re-enable input
  input.disabled = false;
  sendBtn.disabled = false;
  input.value = '';
  input.focus();
}

// Setup AI event listeners
function setupAIEventListeners() {
  // Clear input (browser may auto-fill from history)
  const aiInput = document.getElementById('ai-input');
  aiInput.value = '';
  // Also clear after a delay (browser restores autofill after page load)
  setTimeout(() => { aiInput.value = ''; }, 100);

  // Connect button
  document.getElementById('connect-openrouter-btn').addEventListener('click', () => {
    startOAuthFlow();
  });

  // Disconnect button
  document.getElementById('ai-disconnect-btn').addEventListener('click', () => {
    disconnect();
  });

  // Clear chat button
  document.getElementById('ai-clear-btn').addEventListener('click', () => {
    clearChat();
  });

  // Ask button
  document.getElementById('ai-ask-btn').addEventListener('click', () => {
    const input = document.getElementById('ai-input');
    if (input.value.trim()) {
      askAI(input.value.trim());
    }
  });

  // Enter key on input
  document.getElementById('ai-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = document.getElementById('ai-input');
      if (input.value.trim()) {
        askAI(input.value.trim());
      }
    }
  });
}

// Setup settings event listeners
function setupSettingsEventListeners() {
  const settingsModal = document.getElementById('settings-modal');

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    updateGoogleConnectionUI();
    updateSettingsOpenRouterUI();
    settingsModal.classList.add('active');
  });

  // Google Drive connect buttons (in settings and add-stuff mode)
  document.getElementById('settings-connect-google-btn').addEventListener('click', () => {
    DriveStorage.startAuthFlow();
  });
  document.getElementById('connect-google-btn').addEventListener('click', () => {
    DriveStorage.startAuthFlow();
  });

  // Google Drive disconnect
  document.getElementById('google-disconnect-btn').addEventListener('click', () => {
    DriveStorage.disconnect();
    updateGoogleConnectionUI();
    updateAddStuffUI();
  });

  // OpenRouter connect from settings
  document.getElementById('settings-connect-openrouter-btn').addEventListener('click', () => {
    startOAuthFlow();
  });

  // OpenRouter disconnect from settings
  document.getElementById('settings-openrouter-disconnect-btn').addEventListener('click', () => {
    disconnect();
    updateSettingsOpenRouterUI();
  });

  // Sync button
  document.getElementById('sync-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('sync-status');
    const syncBtn = document.getElementById('sync-btn');

    syncBtn.disabled = true;
    statusEl.textContent = 'Syncing...';
    statusEl.className = 'settings-status';

    try {
      await loadPhotoSets();
      await loadInventory();
      renderPhotoGrid();
      populateCategories();
      statusEl.textContent = `Synced! ${photoSets.length} photos, ${inventory.length} items`;
      statusEl.className = 'settings-status success';
    } catch (err) {
      console.error('Sync error:', err);
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = 'settings-status error';
    }

    syncBtn.disabled = false;
  });

  // Close settings modal on background click
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('active');
    }
  });

  // Setup Add Stuff mode event listeners
  setupAddStuffEventListeners();
}

// Update OpenRouter status in settings
function updateSettingsOpenRouterUI() {
  const connectBtn = document.getElementById('settings-connect-openrouter-btn');
  const disconnectBtn = document.getElementById('settings-openrouter-disconnect-btn');
  const status = document.getElementById('openrouter-status');

  if (isConnected()) {
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = '';
    status.textContent = 'Connected to OpenRouter';
    status.className = 'settings-status success';
  } else {
    connectBtn.style.display = '';
    disconnectBtn.style.display = 'none';
    status.textContent = 'Not connected';
    status.className = 'settings-status';
  }
}

// Update Add Stuff mode UI based on connection status
function updateAddStuffUI() {
  const notConnected = document.getElementById('add-not-connected');
  const connected = document.getElementById('add-connected');
  const openrouterPrompt = document.getElementById('add-openrouter-prompt');

  const googleConnected = DriveStorage.isConnected();
  const aiConnected = isConnected();

  if (googleConnected && aiConnected) {
    // Fully connected - show chat interface
    notConnected.style.display = 'none';
    connected.style.display = 'block';
  } else if (googleConnected) {
    // Google connected but not OpenRouter - prompt for OpenRouter
    notConnected.style.display = 'block';
    connected.style.display = 'none';
    document.getElementById('connect-google-btn').style.display = 'none';
    openrouterPrompt.style.display = 'block';
  } else {
    // Not connected to Google
    notConnected.style.display = 'block';
    connected.style.display = 'none';
    document.getElementById('connect-google-btn').style.display = '';
    openrouterPrompt.style.display = 'none';
  }
}

// Setup Add Stuff mode event listeners
function setupAddStuffEventListeners() {
  // OpenRouter connect from add-stuff mode
  const addConnectBtn = document.getElementById('add-connect-openrouter-btn');
  if (addConnectBtn) {
    addConnectBtn.addEventListener('click', () => {
      startOAuthFlow();
    });
  }

  // Photo input button
  document.getElementById('add-photo-btn').addEventListener('click', () => {
    document.getElementById('add-photo-input').click();
  });

  // Photo file selection
  document.getElementById('add-photo-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      await handlePhotosSelected(files);
    }
    e.target.value = ''; // Reset for next selection
  });

  // Send button
  document.getElementById('add-send-btn').addEventListener('click', () => {
    const input = document.getElementById('add-input');
    if (input.value.trim()) {
      handleAddMessage(input.value.trim());
      input.value = '';
    }
  });

  // Enter key on input
  document.getElementById('add-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const input = document.getElementById('add-input');
      if (input.value.trim()) {
        handleAddMessage(input.value.trim());
        input.value = '';
      }
    }
  });

  // Clear/Start Over button
  document.getElementById('add-clear-btn').addEventListener('click', () => {
    clearAddStuffChat();
  });
}

// Add Stuff conversation state
const addStuffState = {
  pendingPhotos: [],      // { file, dataUrl, analyzing }
  detectedItems: [],      // { item, brand, model, type, confirmed }
  selectedBox: null,
  newBoxPrefix: null,     // prefix for a box being created this session
  chatHistory: []
};

// Handle photos selected for Add Stuff
async function handlePhotosSelected(files) {
  const pendingContainer = document.getElementById('pending-photos');

  for (const file of files) {
    // Convert to data URL for preview and vision API
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const photoEntry = { file, dataUrl, analyzing: false };
    addStuffState.pendingPhotos.push(photoEntry);

    // Add preview
    const img = document.createElement('img');
    img.src = dataUrl;
    img.className = 'pending-photo';
    img.dataset.index = addStuffState.pendingPhotos.length - 1;
    pendingContainer.appendChild(img);
  }

  // Trigger analysis
  addAddChatMessage(`Added ${files.length} photo${files.length > 1 ? 's' : ''}. Analyzing...`, 'assistant');
  await analyzePhotosWithVision();
}

// Analyze photos with vision model
async function analyzePhotosWithVision() {
  const apiKey = localStorage.getItem('openrouter_key');
  if (!apiKey) {
    addAddChatMessage('Please connect OpenRouter to analyze photos.', 'assistant');
    return;
  }

  const unanalyzed = addStuffState.pendingPhotos.filter(p => !p.analyzed);
  if (unanalyzed.length === 0) return;

  // Mark as analyzing
  unanalyzed.forEach(p => p.analyzing = true);
  updatePendingPhotosUI();

  try {
    // Build vision message with all pending photos
    const imageContents = unanalyzed.map(p => ({
      type: 'image_url',
      image_url: { url: p.dataUrl }
    }));

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': CALLBACK_URL,
        'X-Title': 'Trouve-Tout'
      },
      body: JSON.stringify({
        model: MODELS.vision,
        messages: [
          {
            role: 'system',
            content: `You are helping catalog tools for an inventory app. Analyze the image(s) and identify each tool you see.

For each tool, provide:
- item: what it is (e.g., "Circular Saw", "Cordless Drill")
- brand: manufacturer if visible (or "Unknown")
- model: model number if visible (or null)
- type: power type (e.g., "cordless", "corded", "pneumatic", "manual")

Respond with a JSON array of objects. Example:
[{"item": "Cordless Drill", "brand": "DeWalt", "model": "DCD771", "type": "cordless"}]

Only output the JSON array, no other text.`
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What tools do you see in these photos?' },
              ...imageContents
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse the JSON response
    let items = [];
    try {
      // Handle possible markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        items = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.error('Failed to parse vision response:', content);
      addAddChatMessage('Had trouble identifying the tools. Please describe them manually.', 'assistant');
    }

    // Add detected items
    if (items.length > 0) {
      items.forEach(item => {
        addStuffState.detectedItems.push({ ...item, confirmed: false });
      });
      updateDetectedItemsUI();

      const itemList = items.map(i => `${i.item}${i.brand !== 'Unknown' ? ` (${i.brand})` : ''}`).join(', ');
      addAddChatMessage(`I found: ${itemList}\n\nDoes this look right? Tap an item to edit it, or type corrections.`, 'assistant');
    } else {
      addAddChatMessage("I couldn't identify specific tools. Please describe what's in the photos.", 'assistant');
    }

    // Mark as analyzed
    unanalyzed.forEach(p => {
      p.analyzing = false;
      p.analyzed = true;
    });
    updatePendingPhotosUI();

  } catch (err) {
    console.error('Vision analysis error:', err);
    addAddChatMessage(`Error analyzing photos: ${err.message}`, 'assistant');
    unanalyzed.forEach(p => p.analyzing = false);
    updatePendingPhotosUI();
  }
}

// Update pending photos UI
function updatePendingPhotosUI() {
  const container = document.getElementById('pending-photos');
  const photos = container.querySelectorAll('.pending-photo');

  photos.forEach((img, idx) => {
    const photo = addStuffState.pendingPhotos[idx];
    if (photo) {
      img.classList.toggle('analyzing', photo.analyzing);
    }
  });
}

// Update detected items UI
function updateDetectedItemsUI() {
  const container = document.getElementById('detected-items');
  container.innerHTML = addStuffState.detectedItems.map((item, idx) => `
    <div class="item-chip ${item.confirmed ? 'confirmed' : ''}" data-index="${idx}">
      <span class="item-chip-text">${item.item}${item.brand !== 'Unknown' ? ` (${item.brand})` : ''}</span>
      <span class="item-chip-remove" data-index="${idx}">&times;</span>
    </div>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.item-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (!e.target.classList.contains('item-chip-remove')) {
        const idx = parseInt(chip.dataset.index);
        editDetectedItem(idx);
      }
    });
  });

  container.querySelectorAll('.item-chip-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.index);
      addStuffState.detectedItems.splice(idx, 1);
      updateDetectedItemsUI();
    });
  });
}

// Edit a detected item
function editDetectedItem(idx) {
  const item = addStuffState.detectedItems[idx];
  const newName = prompt('Edit item name:', item.item);
  if (newName !== null) {
    item.item = newName;
    item.confirmed = true;
    updateDetectedItemsUI();
  }
}

// Handle text message in Add Stuff mode
async function handleAddMessage(message) {
  addAddChatMessage(message, 'user');
  addStuffState.chatHistory.push({ role: 'user', content: message });

  const lowerMsg = message.toLowerCase();

  // Check for "add X to box N" pattern (adding without photos)
  const addToBoxMatch = message.match(/add\s+(.+?)\s+to\s+box\s*(\d+)/i);
  if (addToBoxMatch) {
    const itemName = addToBoxMatch[1].trim();
    const boxNum = parseInt(addToBoxMatch[2]);
    await addItemWithoutPhoto(itemName, boxNum);
    return;
  }

  // Check for box selection when we have pending items. Match the labels
  // actually on screen first, so "GardenBox 1" picks that box rather than
  // being read as box number 1.
  if (addStuffState.detectedItems.length > 0) {
    const labelledBox = findBoxByLabel(message);
    if (labelledBox !== null) {
      addStuffState.selectedBox = labelledBox;
      await saveInventoryItems();
      return;
    }
    const boxMatch = message.match(/box\s*(\d+)/i);
    if (boxMatch) {
      addStuffState.selectedBox = parseInt(boxMatch[1]);
      await saveInventoryItems();
      return;
    }
  }

  // If we have detected items, check for confirmation
  if (addStuffState.detectedItems.length > 0) {
    if (lowerMsg.includes('yes') || lowerMsg.includes('correct') || lowerMsg.includes('right') || lowerMsg.includes('good') || lowerMsg.includes('perfect')) {
      // Confirm all items
      addStuffState.detectedItems.forEach(item => item.confirmed = true);
      updateDetectedItemsUI();
      const known = allBoxNumbers().map(b => `"${boxLabel(b)}"`).join(', ');
      addAddChatMessage(
        `Great! Which box should these go in?${known ? ` (${known})` : ''} Or say "new box".`,
        'assistant'
      );
      return;
    }

    if (lowerMsg.includes('new box')) {
      // Create new box. The number stays internal; the prefix is what the
      // user sees, numbered among boxes sharing that prefix.
      const maxBox = Math.max(...photoSets.map(p => p.box), 0);
      addStuffState.selectedBox = maxBox + 1;

      const prefix = prompt(
        'Name for the new box? Just the prefix - it gets numbered automatically.\n' +
        `Leave as "${DEFAULT_BOX_PREFIX}" for the usual numbering, or try "GardenBox".`,
        DEFAULT_BOX_PREFIX
      );
      if (prefix === null) return; // cancelled
      addStuffState.newBoxPrefix = prefix.trim() || DEFAULT_BOX_PREFIX;

      const category = prompt('What category for the new box?', 'Tools');
      if (category) {
        await saveInventoryItems(category);
      }
      return;
    }
  }

  // Otherwise, use AI to continue conversation
  await continueAddConversation(message);
}

// Add item without photo to existing box
async function addItemWithoutPhoto(itemName, boxNum) {
  // Find an existing photoset for this box to get category
  const existingPhoto = photoSets.find(p => p.box === boxNum);
  if (!existingPhoto) {
    addAddChatMessage(`${boxLabel(boxNum)} doesn't exist yet. Take a photo first to create the box, or use a different box number.`, 'assistant');
    return;
  }

  // Generate a unique ID
  const boxItems = inventory.filter(i => i.photoSet.startsWith(String(boxNum)));
  const nextSeq = boxItems.length + 1;
  const newId = `${boxNum}a${nextSeq}`;

  // Create the new item
  const newItem = {
    id: newId,
    category: existingPhoto.category,
    photoSet: existingPhoto.file.replace('.jpg', ''),
    item: itemName,
    brand: 'Unknown',
    model: '',
    type: '',
    notes: ''
  };

  // Add to inventory
  inventory.push(newItem);

  // Save to Drive
  try {
    await DriveStorage.saveInventory(inventory);
    addAddChatMessage(`Added "${itemName}" to ${boxLabel(boxNum)}!`, 'assistant');
  } catch (err) {
    console.error('Failed to save:', err);
    addAddChatMessage(`Error saving: ${err.message}`, 'assistant');
    // Remove from local inventory on failure
    inventory.pop();
  }
}

// Continue Add Stuff conversation with AI
async function continueAddConversation(message) {
  const apiKey = localStorage.getItem('openrouter_key');
  if (!apiKey) {
    addAddChatMessage('Please connect OpenRouter first.', 'assistant');
    return;
  }

  addAddChatMessage('Thinking...', 'thinking');

  try {
    const context = {
      pendingPhotos: addStuffState.pendingPhotos.length,
      detectedItems: addStuffState.detectedItems,
      existingBoxes: allBoxNumbers().map(b => boxLabel(b))
    };

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': CALLBACK_URL,
        'X-Title': 'Trouve-Tout'
      },
      body: JSON.stringify({
        model: MODELS.chat,
        messages: [
          {
            role: 'system',
            content: `You are helping a user add tools to their inventory. Be brief and helpful.

Current state:
- Photos pending: ${context.pendingPhotos}
- Detected items: ${JSON.stringify(context.detectedItems)}
- Existing boxes: ${context.existingBoxes.join(', ')}

Help them:
1. Correct any misidentified items
2. Choose which box to put items in
3. Create new boxes if needed

Keep responses short and action-oriented.`
          },
          ...addStuffState.chatHistory.slice(-10)
        ]
      })
    });

    removeAddThinkingMessage();

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "I'm not sure how to help with that.";

    addAddChatMessage(reply, 'assistant');
    addStuffState.chatHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    console.error('Add conversation error:', err);
    removeAddThinkingMessage();
    addAddChatMessage(`Error: ${err.message}`, 'assistant');
  }
}

// Save inventory items to Drive
async function saveInventoryItems(newCategory = null) {
  if (addStuffState.detectedItems.length === 0) {
    addAddChatMessage('No items to save.', 'assistant');
    return;
  }

  const box = addStuffState.selectedBox;
  if (!box) {
    addAddChatMessage('Please specify a box number first.', 'assistant');
    return;
  }

  addAddChatMessage('Saving to Google Drive...', 'thinking');

  try {
    // Load existing photosets to find next available view letter
    const currentPhotosets = await DriveStorage.loadPhotosets() || [];
    const existingViews = currentPhotosets
      .filter(p => p.box === box)
      .map(p => p.view);

    // Find next available letter (after existing ones)
    let startIndex = 0;
    if (existingViews.length > 0) {
      const maxView = existingViews.sort().pop(); // Get highest letter
      startIndex = maxView.charCodeAt(0) - 96; // 'a'=1, 'b'=2, etc.
    }

    // Upload photos first
    const uploadedPhotos = [];
    for (let i = 0; i < addStuffState.pendingPhotos.length; i++) {
      const photo = addStuffState.pendingPhotos[i];
      const viewLetter = String.fromCharCode(97 + startIndex + i); // Continue from next available
      const filename = `${box}${viewLetter}.jpg`;

      // Convert data URL to blob
      const response = await fetch(photo.dataUrl);
      const blob = await response.blob();

      const uploaded = await DriveStorage.uploadPhoto(blob, filename);
      uploadedPhotos.push({
        file: filename,
        driveId: uploaded.id,
        box: box,
        view: viewLetter,
        // Photos added to an existing box inherit its prefix so every row
        // for a box agrees on the name.
        boxPrefix: addStuffState.newBoxPrefix || boxPrefixOf(box),
        category: newCategory || addStuffState.detectedItems[0]?.category || 'Tools'
      });
    }

    // Update photosets (reuse currentPhotosets loaded earlier)
    const updatedPhotosets = [...currentPhotosets, ...uploadedPhotos];
    await DriveStorage.savePhotosets(updatedPhotosets);

    // Create inventory items
    const currentInventory = await DriveStorage.loadInventory() || [];
    const photoSetRef = uploadedPhotos.map(p => p.file.replace('.jpg', '')).join('/');
    const category = uploadedPhotos[0]?.category || 'Tools';

    const newItems = addStuffState.detectedItems.map((item, idx) => ({
      id: `${box}${uploadedPhotos[0]?.view || 'a'}${idx + 1}`,
      category: category,
      photoSet: photoSetRef,
      item: item.item,
      brand: item.brand || 'Unknown',
      model: item.model || '',
      type: item.type || '',
      notes: ''
    }));

    const updatedInventory = [...currentInventory, ...newItems];
    await DriveStorage.saveInventory(updatedInventory);

    // Update local state
    photoSets = updatedPhotosets;
    inventory = updatedInventory;
    renderPhotoGrid();

    removeAddThinkingMessage();
    addAddChatMessage(`Saved ${newItems.length} item${newItems.length > 1 ? 's' : ''} to ${boxLabel(box)}!`, 'assistant');

    // Clear state for next batch
    clearAddStuffState();

  } catch (err) {
    console.error('Save error:', err);
    removeAddThinkingMessage();
    addAddChatMessage(`Error saving: ${err.message}`, 'assistant');
  }
}

// Add message to Add Stuff chat
function addAddChatMessage(content, role) {
  const container = document.getElementById('add-chat-messages');
  const welcome = container.querySelector('.chat-welcome');
  if (welcome) welcome.remove();

  const div = document.createElement('div');
  div.className = `chat-message ${role}`;
  div.textContent = content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// Remove thinking message from Add Stuff chat
function removeAddThinkingMessage() {
  const container = document.getElementById('add-chat-messages');
  const thinking = container.querySelector('.chat-message.thinking');
  if (thinking) thinking.remove();
}

// Clear Add Stuff chat and state
function clearAddStuffChat() {
  clearAddStuffState();
  document.getElementById('add-chat-messages').innerHTML = `
    <div class="chat-welcome">
      <p>Let's add some tools to your inventory!</p>
      <p class="ai-examples">Take a photo, or type "add hammer to box 2"</p>
    </div>
  `;
}

// Clear just the state
function clearAddStuffState() {
  addStuffState.pendingPhotos = [];
  addStuffState.detectedItems = [];
  addStuffState.selectedBox = null;
  addStuffState.newBoxPrefix = null;
  addStuffState.chatHistory = [];
  document.getElementById('pending-photos').innerHTML = '';
  document.getElementById('detected-items').innerHTML = '';
}

// Register service worker
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('sw.js');
    } catch (err) {
      console.error('Service worker registration failed:', err);
    }
  }
}

// Start app
init();
