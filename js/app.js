// Photo sets - loaded from JSON
let photoSets = [];

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

// Initialize app
async function init() {
  await loadPhotoSets();
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

// Load photo sets data (from GitHub API if PAT configured, otherwise static file)
async function loadPhotoSets() {
  try {
    const pat = getGitHubPAT();
    if (pat) {
      // Fetch from GitHub API for latest data
      const fileInfo = await getFileFromGitHub('data/photosets.json');
      if (fileInfo && fileInfo.content) {
        photoSets = JSON.parse(atob(fileInfo.content.replace(/\n/g, '')));
        console.log('Loaded photosets from GitHub API');
        return;
      }
    }
    // Fall back to static file
    const response = await fetch('data/photosets.json');
    photoSets = await response.json();
    console.log('Loaded photosets from static file');
  } catch (err) {
    console.error('Failed to load photosets:', err);
    photoSets = [];
  }
}

// Load inventory data (from GitHub API if PAT configured, otherwise static file)
async function loadInventory() {
  try {
    const pat = getGitHubPAT();
    if (pat) {
      // Fetch from GitHub API for latest data
      const fileInfo = await getFileFromGitHub('data/inventory.json');
      if (fileInfo && fileInfo.content) {
        inventory = JSON.parse(atob(fileInfo.content.replace(/\n/g, '')));
        console.log('Loaded inventory from GitHub API');
        return;
      }
    }
    // Fall back to static file
    const response = await fetch('data/inventory.json');
    inventory = await response.json();
    console.log('Loaded inventory from static file');
  } catch (err) {
    console.error('Failed to load inventory:', err);
    inventory = [];
  }
}

// Render photo grid for visual browsing
function renderPhotoGrid() {
  photoGrid.innerHTML = photoSets.map(photo => `
    <div class="photo-card" data-file="${photo.file}" data-box="${photo.box}" data-category="${photo.category}">
      <img src="images/thumbs/${photo.file}" alt="Box ${photo.box} view ${photo.view}" loading="lazy">
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
  chatHistory = [];
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

// Get file info from GitHub (including SHA for updates)
async function getFileFromGitHub(path) {
  const pat = getGitHubPAT();
  const url = `${GITHUB_API_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  const response = await fetch(url, {
    headers: { 'Authorization': `token ${pat}` }
  });

  if (!response.ok) return null;
  return await response.json();
}

// Update photosets.json on GitHub
async function updatePhotoSetsOnGitHub(newEntry) {
  const path = 'data/photosets.json';
  const fileInfo = await getFileFromGitHub(path);

  if (!fileInfo) {
    throw new Error('Could not fetch photosets.json');
  }

  // Decode current content
  const currentContent = JSON.parse(atob(fileInfo.content));
  currentContent.push(newEntry);

  // Encode updated content
  const updatedContent = btoa(JSON.stringify(currentContent, null, 2));

  const pat = getGitHubPAT();
  const url = `${GITHUB_API_URL}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: `Add ${newEntry.file} to photosets`,
      content: updatedContent,
      sha: fileInfo.sha
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update photosets.json');
  }
}

// Upload photo to GitHub
async function uploadPhoto(file, boxNumber, category) {
  const viewLetter = await getNextViewLetter(parseInt(boxNumber));
  const filename = `${boxNumber}${viewLetter}.jpg`;
  const path = `images/${filename}`;

  const base64Content = await fileToBase64(file);
  const message = `Add photo ${filename} for Box ${boxNumber}`;

  // Upload the image
  await commitToGitHub(path, base64Content, message);

  // Update photosets.json
  const newEntry = {
    file: filename,
    box: parseInt(boxNumber),
    view: viewLetter,
    category: category
  };
  await updatePhotoSetsOnGitHub(newEntry);

  return { filename, boxNumber, viewLetter };
}

// Setup settings event listeners
function setupSettingsEventListeners() {
  const settingsModal = document.getElementById('settings-modal');

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
