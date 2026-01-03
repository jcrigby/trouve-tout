// Photo sets with their box numbers and categories
const photoSets = [
  { file: '1a.jpg', box: 1, view: 'a', category: 'Nail Guns & Fasteners' },
  { file: '1b.jpg', box: 1, view: 'b', category: 'Nail Guns & Fasteners' },
  { file: '2a.jpg', box: 2, view: 'a', category: 'Hand Tools & Misc' },
  { file: '2b.jpg', box: 2, view: 'b', category: 'Hand Tools & Misc' },
  { file: '3a.jpg', box: 3, view: 'a', category: 'Sanders & Grinder' },
  { file: '3b.jpg', box: 3, view: 'b', category: 'Sanders & Grinder' },
  { file: '3c.jpg', box: 3, view: 'c', category: 'Sanders & Grinder' },
  { file: '3d.jpg', box: 3, view: 'd', category: 'Sanders & Grinder' },
  { file: '3e.jpg', box: 3, view: 'e', category: 'Sanders & Grinder' },
  { file: '4a.jpg', box: 4, view: 'a', category: 'Saws & Grinders' },
  { file: '4b.jpg', box: 4, view: 'b', category: 'Saws & Grinders' }
];

let inventory = [];
let currentBoxNumber = null;
let currentPhotoIndex = 0;
let touchStartX = 0;
let touchEndX = 0;

// OpenRouter OAuth config
const OPENROUTER_AUTH_URL = 'https://openrouter.ai/auth';
const OPENROUTER_TOKEN_URL = 'https://openrouter.ai/api/v1/auth/keys';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CALLBACK_URL = window.location.origin + window.location.pathname;

// GitHub config
const GITHUB_OWNER = 'jcrigby';
const GITHUB_REPO = 'trouve-tout';
const GITHUB_API_URL = 'https://api.github.com';

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
  setupAIEventListeners();
  setupSettingsEventListeners();
  registerServiceWorker();

  // Handle OAuth callback if returning from OpenRouter
  const callbackHandled = await handleOAuthCallback();
  if (callbackHandled) {
    // Switch to Ask AI tab after successful connection
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector('[data-mode="ask-ai"]').classList.add('active');
    modeContents.forEach(content => {
      content.classList.toggle('active', content.id === 'ask-ai-mode');
    });
  }

  // Update AI UI based on connection status
  updateAIConnectionUI();
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

  // Modal close buttons and home links
  document.querySelectorAll('.modal .close, .modal-home').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
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

  // Idiot check button
  document.getElementById('idiot-check-btn').addEventListener('click', () => {
    showIdiotCheck();
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
  renderResults(inventory, true);
}

// Show idiot check - things that don't belong together
function showIdiotCheck() {
  const suggestions = [
    { item: 'Cordless Vacuum', box: 3, issue: 'A vacuum in the Sanders box? It sucks, but not in the sanding way.' },
    { item: 'Putty Knives/Scrapers', box: 4, issue: 'Hand tools crashing the power tool party in Saws & Grinders.' },
    { item: 'Propane Torch Kit', box: 2, issue: 'Fire and chisels are roommates. What could go wrong?' }
  ];

  const html = suggestions.map(s =>
    `<div class="suggestion-item">
      <strong>${s.item}</strong> (Box ${s.box})<br>
      <span class="suggestion-note">${s.issue}</span>
    </div>`
  ).join('');

  // Show in a simple alert-style modal (reuse photo modal structure)
  document.getElementById('modal-box-number').textContent = 'Maybe reconsider...';
  document.getElementById('modal-image').style.display = 'none';
  document.getElementById('modal-category').innerHTML = html;

  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();

  document.getElementById('show-box-contents-btn').style.display = 'none';
  photoModal.classList.add('active');
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
function showPhotoModal(file, box, category) {
  currentPhotoIndex = photoSets.findIndex(p => p.file === file);
  currentBoxNumber = box;
  document.getElementById('modal-box-number').textContent = `Box ${box}`;
  const modalImage = document.getElementById('modal-image');
  modalImage.src = `images/${file}`;
  modalImage.style.display = '';
  document.getElementById('modal-category').textContent = category;
  document.getElementById('show-box-contents-btn').style.display = '';
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
function updatePhotoDisplay() {
  const photo = photoSets[currentPhotoIndex];
  const img = document.getElementById('modal-image');
  currentBoxNumber = photo.box;

  img.style.opacity = '0.5';
  img.src = `images/${photo.file}`;
  img.onload = () => { img.style.opacity = '1'; };

  document.getElementById('modal-box-number').textContent = `Box ${photo.box}`;
  document.getElementById('modal-category').textContent = photo.category;

  // Clear inventory list when navigating
  const existingList = photoModal.querySelector('.inventory-list');
  if (existingList) existingList.remove();
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
          <h3>Box ${box}</h3>
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
  updateAIConnectionUI();
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

// Ask AI about inventory
async function askAI(question) {
  const apiKey = localStorage.getItem('openrouter_key');
  if (!apiKey) {
    return 'Not connected to OpenRouter. Please connect first.';
  }

  const responseDiv = document.getElementById('ai-response');
  responseDiv.innerHTML = '<p class="ai-thinking">Thinking...</p>';

  // Build context with inventory
  const inventoryContext = JSON.stringify(inventory, null, 2);

  const systemPrompt = `You are a helpful assistant for a tool inventory app called Trouve-Tout.
The user has tools stored in numbered boxes. Here is their complete inventory:

${inventoryContext}

Answer questions about their inventory conversationally and helpfully.
When mentioning items, include the box number so they can find them.
Keep answers concise but friendly.`;

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || 'No response received';
    responseDiv.innerHTML = `<div class="ai-answer">${answer}</div>`;
    return answer;
  } catch (err) {
    console.error('AI query error:', err);
    responseDiv.innerHTML = `<p class="ai-error">Error: ${err.message}</p>`;
    return null;
  }
}

// Setup AI event listeners
function setupAIEventListeners() {
  // Connect button
  document.getElementById('connect-openrouter-btn').addEventListener('click', () => {
    startOAuthFlow();
  });

  // Disconnect button
  document.getElementById('ai-disconnect-btn').addEventListener('click', () => {
    disconnect();
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
    if (e.key === 'Enter') {
      const input = document.getElementById('ai-input');
      if (input.value.trim()) {
        askAI(input.value.trim());
      }
    }
  });
}

// ==================== GitHub Integration ====================

// Get GitHub PAT from localStorage
function getGitHubPAT() {
  return localStorage.getItem('github_pat');
}

// Save GitHub PAT to localStorage
function saveGitHubPAT(pat) {
  localStorage.setItem('github_pat', pat);
}

// Check if GitHub is configured
function isGitHubConfigured() {
  return !!getGitHubPAT();
}

// Check if file exists on GitHub
async function fileExistsOnGitHub(path) {
  const pat = getGitHubPAT();
  const url = `${GITHUB_API_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `token ${pat}` }
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Get next available view letter for a box (checks GitHub)
async function getNextViewLetter(boxNumber) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';

  for (const letter of alphabet) {
    const filename = `${boxNumber}${letter}.jpg`;
    const exists = await fileExistsOnGitHub(`images/${filename}`);
    if (!exists) {
      return letter;
    }
  }
  return 'z'; // fallback
}

// Commit a file to GitHub
async function commitToGitHub(path, content, message) {
  const pat = getGitHubPAT();
  if (!pat) {
    throw new Error('GitHub PAT not configured');
  }

  const url = `${GITHUB_API_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: message,
      content: content, // must be base64 encoded
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || `GitHub API error: ${response.status}`);
  }

  return await response.json();
}

// Convert file to base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Upload photo to GitHub
async function uploadPhoto(file, boxNumber) {
  const viewLetter = await getNextViewLetter(parseInt(boxNumber));
  const filename = `${boxNumber}${viewLetter}.jpg`;
  const path = `images/${filename}`;

  const base64Content = await fileToBase64(file);
  const message = `Add photo ${filename} for Box ${boxNumber}`;

  await commitToGitHub(path, base64Content, message);

  return { filename, boxNumber, viewLetter };
}

// Setup settings event listeners
function setupSettingsEventListeners() {
  const settingsModal = document.getElementById('settings-modal');
  const addPhotoModal = document.getElementById('add-photo-modal');

  // Settings button
  document.getElementById('settings-btn').addEventListener('click', () => {
    // Load current PAT if exists
    const pat = getGitHubPAT();
    if (pat) {
      document.getElementById('github-pat-input').value = pat;
      document.getElementById('pat-status').textContent = 'Token saved';
      document.getElementById('pat-status').className = 'settings-status success';
    }
    settingsModal.classList.add('active');
  });

  // Save PAT button
  document.getElementById('save-pat-btn').addEventListener('click', () => {
    const pat = document.getElementById('github-pat-input').value.trim();
    if (pat) {
      saveGitHubPAT(pat);
      document.getElementById('pat-status').textContent = 'Token saved!';
      document.getElementById('pat-status').className = 'settings-status success';
    } else {
      document.getElementById('pat-status').textContent = 'Please enter a token';
      document.getElementById('pat-status').className = 'settings-status error';
    }
  });

  // Add photo button
  document.getElementById('add-photo-btn').addEventListener('click', () => {
    if (!isGitHubConfigured()) {
      alert('Please configure your GitHub token in Settings first');
      settingsModal.classList.add('active');
      return;
    }
    // Reset the form
    document.getElementById('photo-file-input').value = '';
    document.getElementById('photo-preview').innerHTML = '';
    document.getElementById('upload-photo-btn').disabled = true;
    document.getElementById('upload-status').textContent = '';
    addPhotoModal.classList.add('active');
  });

  // File input change - show preview
  document.getElementById('photo-file-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        document.getElementById('photo-preview').innerHTML =
          `<img src="${e.target.result}" alt="Preview" style="max-width: 100%; border-radius: 8px; margin-top: 1rem;">`;
        document.getElementById('upload-photo-btn').disabled = false;
      };
      reader.readAsDataURL(file);
    }
  });

  // Upload photo button
  document.getElementById('upload-photo-btn').addEventListener('click', async () => {
    const file = document.getElementById('photo-file-input').files[0];
    const boxNumber = document.getElementById('photo-box-select').value;
    const statusEl = document.getElementById('upload-status');
    const uploadBtn = document.getElementById('upload-photo-btn');

    if (!file) return;

    uploadBtn.disabled = true;
    statusEl.textContent = 'Uploading...';
    statusEl.className = 'settings-status';

    try {
      const result = await uploadPhoto(file, boxNumber);
      statusEl.textContent = `Uploaded ${result.filename}! Refresh to see it.`;
      statusEl.className = 'settings-status success';

      // Add to local photoSets so it shows without refresh
      const category = document.getElementById('photo-box-select').selectedOptions[0].text.split(' - ')[1] || 'Uncategorized';
      photoSets.push({
        file: result.filename,
        box: parseInt(result.boxNumber),
        view: result.viewLetter,
        category: category
      });
      renderPhotoGrid();

      // Close modal after short delay
      setTimeout(() => {
        addPhotoModal.classList.remove('active');
      }, 1500);
    } catch (err) {
      console.error('Upload error:', err);
      statusEl.textContent = `Error: ${err.message}`;
      statusEl.className = 'settings-status error';
      uploadBtn.disabled = false;
    }
  });

  // Close buttons for new modals
  [settingsModal, addPhotoModal].forEach(modal => {
    modal.querySelector('.close').addEventListener('click', () => {
      modal.classList.remove('active');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });
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
