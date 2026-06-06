/**
 * AuraMail - Premium Temporary Email Generator
 * Client-side JavaScript powered by Mail.tm API & CORS Proxy compatibility
 */

const API_BASE = 'https://api.mail.tm';
const AUTO_POLL_INTERVAL = 10; // Poll every 10 seconds

// Safe LocalStorage wrapper to prevent SecurityErrors when running from file://
const safeStorage = {
  fallback: {},
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn("Storage access restricted. Using in-memory fallback.", e);
      return this.fallback[key] || null;
    }
  },
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn("Storage access restricted. Using in-memory fallback.", e);
      this.fallback[key] = value;
    }
  },
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn("Storage access restricted. Using in-memory fallback.", e);
      delete this.fallback[key];
    }
  }
};

// Application State
let state = {
  account: null,      // { id, address, password, token }
  domains: [],        // Array of domain strings
  selectedDomain: '', // Selected domain
  messages: [],       // List of messages
  selectedMessage: null, // Full message detail
  pollingTimer: null,
  secondsRemaining: AUTO_POLL_INTERVAL,
  isFetchingMessages: false,
  viewMode: 'html'    // 'html' or 'text'
};

// SVG Progress Ring Calculations
const COUNTDOWN_CIRCLE_ID = 'countdown-circle';
const CIRCLE_RADIUS = 11;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~69.115

// DOM Elements
const elements = {
  fileProtocolWarning: document.getElementById('file-protocol-warning'),
  statusText: document.getElementById('status-text'),
  emailAddressInput: document.getElementById('email-address-input'),
  emailLoadingSpinner: document.getElementById('email-loading-spinner'),
  
  btnCopy: document.getElementById('btn-copy'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnNew: document.getElementById('btn-new'),
  btnDeleteAll: document.getElementById('btn-delete-all'),
  
  timerText: document.getElementById('timer-text'),
  countdownCircle: document.getElementById(COUNTDOWN_CIRCLE_ID),
  domainSelect: document.getElementById('domain-select'),
  
  inboxCount: document.getElementById('inbox-count'),
  inboxEmptyState: document.getElementById('inbox-empty-state'),
  inboxListContainer: document.getElementById('inbox-list-container'),
  
  viewerActiveState: document.getElementById('viewer-active-state'),
  viewerEmptyState: document.getElementById('viewer-empty-state'),
  viewerLoadingState: document.getElementById('viewer-loading-state'),
  
  senderAvatarInitial: document.getElementById('sender-avatar-initial'),
  emailSenderVal: document.getElementById('email-sender-val'),
  emailDateVal: document.getElementById('email-date-val'),
  emailSubjectVal: document.getElementById('email-subject-val'),
  emailContentIframe: document.getElementById('email-content-iframe'),
  emailContentText: document.getElementById('email-content-text'),
  btnDeleteCurrent: document.getElementById('btn-delete-current'),
  
  btnToggleHtml: document.getElementById('btn-toggle-html'),
  btnToggleText: document.getElementById('btn-toggle-text'),
  
  attachmentsPanel: document.getElementById('attachments-panel'),
  attachmentCount: document.getElementById('attachment-count'),
  attachmentList: document.getElementById('attachment-list')
};

/* ==========================================================================
   API Helpers & CORS Proxy
   ========================================================================== */

/**
 * Checks if the protocol is file:// and routes the request through a CORS proxy if necessary.
 */
function getRequestUrl(endpoint) {
  // If served from our local static server, route through the server's local reverse proxy
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `/api${endpoint}`;
  }
  
  // If opened via local file protocol (file://), display the warning banner to guide the user
  if (window.location.protocol === 'file:') {
    if (elements.fileProtocolWarning) {
      elements.fileProtocolWarning.classList.remove('hidden');
    }
  }
  
  // For all other hosts (like GitHub Pages/Netlify) and local file fallbacks, route through the CORS proxy
  const targetUrl = `${API_BASE}${endpoint}`;
  return `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
}

/**
 * Perform a request to the Mail.tm API (wrapping with CORS proxy automatically)
 */
async function apiRequest(endpoint, method = 'GET', body = null, useAuth = true) {
  const url = getRequestUrl(endpoint);
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  if (useAuth && state.account && state.account.token) {
    headers['Authorization'] = `Bearer ${state.account.token}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    
    // Check for 204 No Content (typically deletes)
    if (response.status === 204) {
      return true;
    }

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.detail || `HTTP error! Status: ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error(`API Request Error (${method} ${endpoint}):`, error);
    throw error;
  }
}

/* ==========================================================================
   Core Functionality
   ========================================================================== */

/**
 * Initialize the application
 */
async function initApp() {
  setupEventHandlers();
  initProgressRing();
  
  try {
    updateStatus('Connecting...', 'warning');
    
    // Load domains first
    await loadDomains();
    
    // Load existing session or create a new one
    const savedAccount = safeStorage.getItem('auramail_account');
    if (savedAccount) {
      state.account = JSON.parse(savedAccount);
      elements.emailAddressInput.value = state.account.address;
      
      // Update domain select dropdown to match
      const currentDomain = state.account.address.split('@')[1];
      if (state.domains.includes(currentDomain)) {
        state.selectedDomain = currentDomain;
        elements.domainSelect.value = currentDomain;
      }
      
      updateStatus('Connected', 'success');
      // Trigger initial poll
      await fetchMessages();
    } else {
      await generateNewSession();
    }
    
    // Start auto polling countdown
    startCountdown();
  } catch (error) {
    updateStatus('Offline / Error', 'danger');
    showNotification('Connection Error', 'Failed to connect to the mail API. Retrying in seconds...', 'error');
  }
}

/**
 * Load list of available domains from API
 */
async function loadDomains() {
  try {
    const domainsData = await apiRequest('/domains', 'GET', null, false);
    const domainList = domainsData['hydra:member'] || [];
    state.domains = domainList.filter(d => d.isActive).map(d => d.domain);
    
    // Populate select element
    elements.domainSelect.innerHTML = '';
    state.domains.forEach(domain => {
      const option = document.createElement('option');
      option.value = domain;
      option.textContent = `@${domain}`;
      elements.domainSelect.appendChild(option);
    });
    
    if (state.domains.length > 0) {
      state.selectedDomain = state.domains[0];
      elements.domainSelect.value = state.domains[0];
    }
  } catch (error) {
    console.error('Failed to load domains:', error);
    throw error;
  }
}

/**
 * Generate a new random account and token
 */
async function generateNewSession() {
  elements.emailLoadingSpinner.classList.remove('hidden');
  elements.emailAddressInput.value = 'Generating email address...';
  updateStatus('Generating...', 'warning');
  
  try {
    // 1. Generate random username and password credentials
    const username = Math.random().toString(36).substring(2, 12);
    const password = Math.random().toString(36).substring(2, 15);
    const domain = state.selectedDomain || state.domains[0];
    const emailAddress = `${username}@${domain}`;

    // 2. Create the account on mail.tm
    const accountData = await apiRequest('/accounts', 'POST', {
      address: emailAddress,
      password: password
    }, false);
    
    // 3. Authenticate to retrieve JWT token
    const tokenData = await apiRequest('/token', 'POST', {
      address: emailAddress,
      password: password
    }, false);
    
    // 4. Update local and stored state
    state.account = {
      id: accountData.id,
      address: emailAddress,
      password: password,
      token: tokenData.token
    };
    
    safeStorage.setItem('auramail_account', JSON.stringify(state.account));
    elements.emailAddressInput.value = emailAddress;
    
    updateStatus('Connected', 'success');
    
    // Reset message viewer & lists
    state.messages = [];
    state.selectedMessage = null;
    updateInboxUI();
    showViewerEmptyState();
    
    showNotification('New Address Ready', 'Your temporary email address is active.', 'success');
  } catch (error) {
    console.error('Error generating new session:', error);
    updateStatus('Error', 'danger');
    elements.emailAddressInput.value = 'Generation failed. Click "Generate New".';
    showNotification('Error', 'Could not generate email address. Please click Generate New.', 'error');
  } finally {
    elements.emailLoadingSpinner.classList.add('hidden');
  }
}

/**
 * Fetch messages from API
 */
async function fetchMessages() {
  if (!state.account || state.isFetchingMessages) return;
  
  state.isFetchingMessages = true;
  updateStatus('Syncing...', 'warning');
  
  try {
    // Show skeleton if list is empty
    const isFirstLoad = state.messages.length === 0;
    if (isFirstLoad) {
      showInboxLoadingState();
    }
    
    const messagesData = await apiRequest('/messages?page=1', 'GET');
    const newMessages = messagesData['hydra:member'] || [];
    
    // Check if a new message has arrived
    if (newMessages.length > state.messages.length) {
      const difference = newMessages.length - state.messages.length;
      playNotificationSound();
      showNotification('New Email Received', `Received ${difference} new message(s).`, 'success');
    }
    
    state.messages = newMessages;
    updateInboxUI();
    updateStatus('Synchronized', 'success');
  } catch (error) {
    console.error('Error fetching messages:', error);
    
    // Re-authenticate if auth token is expired or unauthorized (401)
    if (error.message && (error.message.includes('expired') || error.message.includes('401'))) {
      await refreshAuthToken();
    } else {
      updateStatus('Sync Error', 'warning');
    }
  } finally {
    state.isFetchingMessages = false;
  }
}

/**
 * Re-authenticate using stored credentials
 */
async function refreshAuthToken() {
  if (!state.account) return;
  try {
    updateStatus('Re-authenticating...', 'warning');
    const tokenData = await apiRequest('/token', 'POST', {
      address: state.account.address,
      password: state.account.password
    }, false);
    
    state.account.token = tokenData.token;
    safeStorage.setItem('auramail_account', JSON.stringify(state.account));
    updateStatus('Synchronized', 'success');
    await fetchMessages();
  } catch (error) {
    console.error('Failed to re-authenticate:', error);
    // Credentials might be expired/deleted on API database, clear and start fresh
    safeStorage.removeItem('auramail_account');
    await generateNewSession();
  }
}

/**
 * Fetch detailed content of a single email message
 */
async function fetchMessageDetails(messageId) {
  showViewerLoadingState();
  
  try {
    const messageDetails = await apiRequest(`/messages/${messageId}`, 'GET');
    state.selectedMessage = messageDetails;
    
    // Mark as read locally
    const localMsgIndex = state.messages.findIndex(m => m.id === messageId);
    if (localMsgIndex !== -1) {
      state.messages[localMsgIndex].seen = true;
      updateInboxUI();
    }
    
    renderSelectedMessage();
  } catch (error) {
    console.error('Failed to load message details:', error);
    showNotification('Error', 'Failed to retrieve email details.', 'error');
    showViewerEmptyState();
  }
}

/**
 * Delete current message from API
 */
async function deleteCurrentMessage() {
  if (!state.selectedMessage) return;
  
  const idToDelete = state.selectedMessage.id;
  updateStatus('Deleting...', 'warning');
  
  try {
    await apiRequest(`/messages/${idToDelete}`, 'DELETE');
    
    // Remove from local state
    state.messages = state.messages.filter(m => m.id !== idToDelete);
    state.selectedMessage = null;
    
    updateInboxUI();
    showViewerEmptyState();
    updateStatus('Synchronized', 'success');
    showNotification('Deleted', 'Email deleted successfully.', 'success');
  } catch (error) {
    console.error('Failed to delete email:', error);
    showNotification('Error', 'Could not delete email from the server.', 'error');
    updateStatus('Synchronized', 'success');
  }
}

/* ==========================================================================
   UI Updates & Rendering
   ========================================================================== */

/**
 * Update header status text and indicators
 */
function updateStatus(text, type = 'success') {
  elements.statusText.textContent = text;
  const pulseDot = document.querySelector('.status-pulse');
  
  // Set custom variable values for neon colors
  if (pulseDot) {
    pulseDot.style.backgroundColor = `var(--color-${type})`;
    pulseDot.style.boxShadow = `0 0 10px var(--color-${type})`;
  }
}

/**
 * Shimmering Skeletal Lines in Inbox feed
 */
function showInboxLoadingState() {
  elements.inboxEmptyState.classList.add('hidden');
  elements.inboxListContainer.innerHTML = '';
  
  for (let i = 0; i < 3; i++) {
    const shimmer = document.createElement('div');
    shimmer.className = 'shimmer-box';
    shimmer.innerHTML = `
      <div class="shimmer-line w-30"></div>
      <div class="shimmer-line w-80"></div>
      <div class="shimmer-line w-60"></div>
    `;
    elements.inboxListContainer.appendChild(shimmer);
  }
}

/**
 * Refresh list rendering of inbox
 */
function updateInboxUI() {
  elements.inboxCount.textContent = state.messages.length;
  elements.inboxListContainer.innerHTML = '';

  if (state.messages.length === 0) {
    elements.inboxEmptyState.classList.remove('hidden');
    elements.inboxListContainer.appendChild(elements.inboxEmptyState);
    return;
  }

  elements.inboxEmptyState.classList.add('hidden');

  state.messages.forEach(msg => {
    const item = document.createElement('div');
    item.className = `inbox-card-item ${state.selectedMessage && state.selectedMessage.id === msg.id ? 'active' : ''} ${!msg.seen ? 'unread' : ''}`;
    
    const senderName = msg.from.name || msg.from.address.split('@')[0];
    const unreadDot = !msg.seen ? '<span class="unread-dot"></span>' : '';
    const timeFormatted = formatRelativeTime(msg.createdAt);
    
    item.innerHTML = `
      <div class="card-item-header">
        <span class="card-item-sender" title="${msg.from.address}">${unreadDot}${senderName}</span>
        <span class="card-item-time">${timeFormatted}</span>
      </div>
      <div class="card-item-subject" title="${msg.subject || '(No Subject)'}">${msg.subject || '(No Subject)'}</div>
      <div class="card-item-summary">${msg.intro || 'No preview content...'}</div>
    `;

    item.addEventListener('click', () => {
      document.querySelectorAll('.inbox-card-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      fetchMessageDetails(msg.id);
    });

    elements.inboxListContainer.appendChild(item);
  });
}

/**
 * Display full message content in the viewer
 */
function renderSelectedMessage() {
  const msg = state.selectedMessage;
  if (!msg) return;

  // View state switch
  elements.viewerEmptyState.classList.add('hidden');
  elements.viewerLoadingState.classList.add('hidden');
  elements.viewerActiveState.classList.remove('hidden');

  // Fields population
  const senderName = msg.from.name || msg.from.address.split('@')[0];
  elements.senderAvatarInitial.textContent = senderName.charAt(0).toUpperCase();
  elements.emailSenderVal.textContent = `${msg.from.name ? msg.from.name + ' ' : ''}<${msg.from.address}>`;
  
  elements.emailDateVal.textContent = new Date(msg.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  elements.emailSubjectVal.textContent = msg.subject || '(No Subject)';

  // Renders HTML content
  let contentHtml = '';
  if (msg.html && msg.html.length > 0) {
    contentHtml = Array.isArray(msg.html) ? msg.html.join('') : msg.html;
  } else {
    const textBody = Array.isArray(msg.text) ? msg.text.join('\n') : (msg.text || '');
    contentHtml = `
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #333; padding: 24px; word-break: break-word; }
            pre { white-space: pre-wrap; font-family: inherit; }
          </style>
        </head>
        <body>
          <pre>${escapeHtml(textBody)}</pre>
        </body>
      </html>
    `;
  }
  
  elements.emailContentIframe.srcdoc = contentHtml;

  // Renders Plain Text fallback representation
  const rawText = Array.isArray(msg.text) ? msg.text.join('\n') : (msg.text || '');
  elements.emailContentText.textContent = rawText || 'No text content available.';

  // Trigger default view mode display
  switchViewMode(state.viewMode);

  // Attachments loading
  const attachments = msg.attachments || [];
  if (attachments.length > 0) {
    elements.attachmentsPanel.classList.remove('hidden');
    elements.attachmentCount.textContent = attachments.length;
    elements.attachmentList.innerHTML = '';

    attachments.forEach(attachment => {
      const li = document.createElement('li');
      li.className = 'attachment-chip';
      
      const sizeStr = formatBytes(attachment.size);
      const downloadUrl = `${API_BASE}${attachment.downloadUrl}`;
      
      const a = document.createElement('a');
      a.href = '#';
      a.innerHTML = `<i class="fa-regular fa-file"></i> <span>${attachment.filename} (${sizeStr})</span>`;
      
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        await downloadAttachment(downloadUrl, attachment.filename);
      });

      li.appendChild(a);
      elements.attachmentList.appendChild(li);
    });
  } else {
    elements.attachmentsPanel.classList.add('hidden');
  }
}

/**
 * Handle Auth download of attachments
 */
async function downloadAttachment(url, filename) {
  try {
    updateStatus('Downloading...', 'warning');
    const headers = {};
    if (state.account && state.account.token) {
      headers['Authorization'] = `Bearer ${state.account.token}`;
    }
    
    // We must route attachment download through the CORS proxy too if on file:// protocol
    let downloadUrl = url;
    if (window.location.protocol === 'file:') {
      downloadUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }
    
    const response = await fetch(downloadUrl, { headers });
    if (!response.ok) throw new Error('File download error.');
    
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    
    const dlLink = document.createElement('a');
    dlLink.href = blobUrl;
    dlLink.download = filename;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
    URL.revokeObjectURL(blobUrl);
    
    updateStatus('Synchronized', 'success');
  } catch (error) {
    console.error('Download error:', error);
    showNotification('Download Failed', 'Could not retrieve attachment.', 'error');
    updateStatus('Synchronized', 'success');
  }
}

/**
 * Switch viewer content layout mode (Rich HTML vs Plain text)
 */
function switchViewMode(mode) {
  state.viewMode = mode;
  
  if (mode === 'html') {
    elements.btnToggleHtml.classList.add('active');
    elements.btnToggleText.classList.remove('active');
    elements.emailContentIframe.classList.remove('hidden');
    elements.emailContentText.classList.add('hidden');
  } else {
    elements.btnToggleHtml.classList.remove('active');
    elements.btnToggleText.classList.add('active');
    elements.emailContentIframe.classList.add('hidden');
    elements.emailContentText.classList.remove('hidden');
  }
}

/* ==========================================================================
   State View Resets
   ========================================================================== */

function showViewerEmptyState() {
  elements.viewerActiveState.classList.add('hidden');
  elements.viewerLoadingState.classList.add('hidden');
  elements.viewerEmptyState.classList.remove('hidden');
}

function showViewerLoadingState() {
  elements.viewerActiveState.classList.add('hidden');
  elements.viewerEmptyState.classList.add('hidden');
  elements.viewerLoadingState.classList.remove('hidden');
}

/* ==========================================================================
   Timer & Countdown Loops
   ========================================================================== */

function initProgressRing() {
  elements.countdownCircle.style.strokeDasharray = `${CIRCLE_CIRCUMFERENCE} ${CIRCLE_CIRCUMFERENCE}`;
  elements.countdownCircle.style.strokeDashoffset = 0;
}

function setProgressPercent(percent) {
  const offset = CIRCLE_CIRCUMFERENCE - (percent / 100) * CIRCLE_CIRCUMFERENCE;
  elements.countdownCircle.style.strokeDashoffset = offset;
}

function startCountdown() {
  if (state.pollingTimer) {
    clearInterval(state.pollingTimer);
  }
  
  state.secondsRemaining = AUTO_POLL_INTERVAL;
  updateTimerUI();
  
  state.pollingTimer = setInterval(async () => {
    state.secondsRemaining--;
    
    if (state.secondsRemaining <= 0) {
      setProgressPercent(100);
      elements.timerText.textContent = 'Syncing...';
      
      const refreshIcon = elements.btnRefresh.querySelector('i');
      refreshIcon.classList.add('fa-spin');
      
      await fetchMessages();
      
      refreshIcon.classList.remove('fa-spin');
      state.secondsRemaining = AUTO_POLL_INTERVAL;
    }
    
    updateTimerUI();
  }, 1000);
}

async function forceInboxRefresh() {
  const refreshIcon = elements.btnRefresh.querySelector('i');
  refreshIcon.classList.add('fa-spin');
  
  setProgressPercent(100);
  elements.timerText.textContent = 'Syncing...';
  
  await fetchMessages();
  
  refreshIcon.classList.remove('fa-spin');
  startCountdown();
  showNotification('Synced', 'Inbox check completed.', 'success');
}

function updateTimerUI() {
  elements.timerText.textContent = `Syncing in ${state.secondsRemaining}s...`;
  const pct = (state.secondsRemaining / AUTO_POLL_INTERVAL) * 100;
  setProgressPercent(pct);
}

/* ==========================================================================
   Events Configuration
   ========================================================================== */

function setupEventHandlers() {
  // Domain Selector
  elements.domainSelect.addEventListener('change', async (e) => {
    state.selectedDomain = e.target.value;
    
    if (state.messages.length > 0) {
      const confirmChange = confirm("Changing domains will clear your current mailbox. Proceed?");
      if (!confirmChange) {
        // Revert selection
        const prevDomain = state.account.address.split('@')[1];
        elements.domainSelect.value = prevDomain;
        state.selectedDomain = prevDomain;
        return;
      }
    }
    await generateNewSession();
    startCountdown();
  });

  // Copy Clipboard Button
  elements.btnCopy.addEventListener('click', () => {
    const address = elements.emailAddressInput.value;
    if (!state.account || address.includes('Generating') || address.includes('failed')) return;
    
    navigator.clipboard.writeText(address).then(() => {
      elements.btnCopy.classList.add('copied');
      setTimeout(() => elements.btnCopy.classList.remove('copied'), 2000);
    }).catch(err => console.error('Copy failure:', err));
  });

  // Sync Inbox Refresh Button
  elements.btnRefresh.addEventListener('click', forceInboxRefresh);

  // Generate New Button
  elements.btnNew.addEventListener('click', async () => {
    if (state.messages.length > 0) {
      const confirmNew = confirm("Generate a new temporary email address? This will clear your current inbox.");
      if (!confirmNew) return;
    }
    await generateNewSession();
    startCountdown();
  });

  // View Mode Toggles
  elements.btnToggleHtml.addEventListener('click', () => switchViewMode('html'));
  elements.btnToggleText.addEventListener('click', () => switchViewMode('text'));

  // Delete message details
  elements.btnDeleteCurrent.addEventListener('click', deleteCurrentMessage);

  // Reset entire mailbox data
  elements.btnDeleteAll.addEventListener('click', async () => {
    const confirmClear = confirm("Reset mail client? This permanently deletes the current address and token.");
    if (!confirmClear) return;
    
    safeStorage.removeItem('auramail_account');
    await generateNewSession();
    startCountdown();
  });
}

/* ==========================================================================
   Utilities & Sound System
   ========================================================================== */

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffSecs = Math.floor((now - date) / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 20) return 'Just now';
  if (diffSecs < 60) return `${diffSecs}s ago`;
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * Synthesizes a high-fidelity soft chime using Web Audio API
 */
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Bell chimes (Synthesize two harmonics)
    const baseFreq = 587.33; // D5
    const times = [0, 0.12];
    const freqs = [baseFreq, baseFreq * 1.5]; // Perfect fifth chord
    
    times.forEach((time, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[index], audioCtx.currentTime + time);
      
      gain.gain.setValueAtTime(0, audioCtx.currentTime + time);
      gain.gain.linearRampToValueAtTime(0.12, audioCtx.currentTime + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + time + 0.7);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(audioCtx.currentTime + time);
      osc.stop(audioCtx.currentTime + time + 0.75);
    });
  } catch (e) {
    console.log("Web Audio synth blocked by browser user-interaction rules.");
  }
}

/**
 * Handle system notifications
 */
function showNotification(title, message, type = 'success') {
  console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
  
  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(`AuraMail`, { body: `${title} - ${message}` });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          new Notification(`AuraMail`, { body: `${title} - ${message}` });
        }
      });
    }
  }
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
