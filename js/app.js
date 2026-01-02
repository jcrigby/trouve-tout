// Photo sets with their box numbers and categories
const photoSets = [
  { file: '1a.jpg', box: 1, view: 'a', category: 'Nail Guns & Fasteners' },
  { file: '1b.jpg', box: 1, view: 'b', category: 'Nail Guns & Fasteners' },
  { file: '2a.jpg', box: 2, view: 'a', category: 'Hand Tools & Misc' },
  { file: '2b.jpg', box: 2, view: 'b', category: 'Hand Tools & Misc' },
  { file: '3a.jpg', box: 3, view: 'a', category: 'Sanders & Grinder' },
  { file: '3b.jpg', box: 3, view: 'b', category: 'Sanders & Grinder' },
  { file: '4a.jpg', box: 4, view: 'a', category: 'Saws & Grinders' },
  { file: '4b.jpg', box: 4, view: 'b', category: 'Saws & Grinders' }
];

let inventory = [];
let currentBoxNumber = null;

// DOM elements
const photoGrid = document.getElementById('photo-grid');
const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const results = document.getElementById('results');
const photoModal = document.getElementById('photo-modal');
const itemModal = document.getElementById('item-modal');
const tabs = document.querySelectorAll('.tab');
const modeContents = document.querySelectorAll('.mode-content');

// Initialize app
async function init() {
  await loadInventory();
  renderPhotoGrid();
  populateCategories();
  setupEventListeners();
  registerServiceWorker();
}

// Load inventory data
async function loadInventory() {
  try {
    const response = await fetch('data/inventory.json');
    inventory = await response.json();
  } catch (err) {
    console.error('Failed to load inventory:', err);
    inventory = [];
  }
}

// Render photo grid for visual browsing
function renderPhotoGrid() {
  photoGrid.innerHTML = photoSets.map(photo => `
    <div class="photo-card" data-file="${photo.file}" data-box="${photo.box}" data-category="${photo.category}">
      <img src="images/${photo.file}" alt="Box ${photo.box} view ${photo.view}" loading="lazy">
      <div class="label">${photo.file}</div>
    </div>
  `).join('');
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

  // Modal close buttons
  document.querySelectorAll('.modal .close').forEach(btn => {
    btn.addEventListener('click', () => {
      photoModal.classList.remove('active');
      itemModal.classList.remove('active');
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

  // Show box contents button
  document.getElementById('show-box-contents-btn').addEventListener('click', () => {
    if (currentBoxNumber) {
      showBoxContents(currentBoxNumber);
    }
  });

  // Show all inventory button
  document.getElementById('show-all-btn').addEventListener('click', () => {
    showAllInventory();
  });
}

// Show contents of a specific box
function showBoxContents(boxNumber) {
  const boxItems = inventory.filter(item => {
    const itemBox = item.photoSet.split('/')[0].replace(/[a-z]/g, '');
    return itemBox === String(boxNumber);
  });

  const listHtml = renderInventoryList(boxItems);

  // Remove existing list if any
  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();

  // Add the list after the button
  const btn = document.getElementById('show-box-contents-btn');
  btn.insertAdjacentHTML('afterend', listHtml);
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
  renderResults(inventory);
}

// Render inventory list HTML
function renderInventoryList(items) {
  if (items.length === 0) {
    return '<div class="inventory-list"><p class="no-results">No items in this box</p></div>';
  }

  return `
    <div class="inventory-list">
      ${items.map(item => `
        <div class="inventory-list-item">
          <h4>${item.item}</h4>
          <div class="meta">${item.brand || 'Unknown'}${item.model ? ' - ' + item.model : ''}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// Show photo modal with box number
function showPhotoModal(file, box, category) {
  currentBoxNumber = box;
  document.getElementById('modal-box-number').textContent = `Box ${box}`;
  document.getElementById('modal-image').src = `images/${file}`;
  document.getElementById('modal-category').textContent = category;
  // Clear any previous inventory list
  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();
  photoModal.classList.add('active');
}

// Show item detail modal
function showItemModal(item) {
  document.getElementById('item-name').textContent = item.item;

  const photos = item.photoSet.split('/');
  const box = photos[0].replace(/[ab]/g, '');

  document.getElementById('item-details').innerHTML = `
    <p><strong>Brand:</strong> ${item.brand || 'Unknown'}</p>
    ${item.model ? `<p><strong>Model:</strong> ${item.model}</p>` : ''}
    <p><strong>Type:</strong> ${item.type}</p>
    <p><strong>Category:</strong> ${item.category}</p>
    ${item.notes ? `<p><strong>Notes:</strong> ${item.notes}</p>` : ''}
    <p><strong>Box:</strong> ${box}</p>
  `;

  document.getElementById('item-photos').innerHTML = photos.map(p =>
    `<img src="images/${p}.jpg" alt="Box ${box}" loading="lazy">`
  ).join('');

  itemModal.classList.add('active');
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
function renderResults(items) {
  if (items.length === 0) {
    results.innerHTML = '<p class="no-results">No items found</p>';
    return;
  }

  results.innerHTML = items.map(item => {
    const box = item.photoSet.split('/')[0].replace(/[ab]/g, '');
    return `
      <div class="result-item" data-id="${item.id}">
        <h3>${item.item}</h3>
        <div class="meta">
          <span>${item.brand || 'Unknown'}</span>
          ${item.model ? `<span>${item.model}</span>` : ''}
        </div>
        ${item.notes ? `<div class="notes">${item.notes}</div>` : ''}
        <span class="box-label">Box ${box}</span>
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
