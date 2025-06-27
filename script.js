// Leaf animation
function createLeaf() {
  const leaf = document.createElement('div');
  leaf.classList.add('falling-leaf');
  leaf.style.left = Math.random() * 100 + 'vw';
  leaf.style.animationDuration = Math.random() * 5 + 5 + 's';
  document.body.appendChild(leaf);

  setTimeout(() => {
    leaf.remove();
  }, 10000);
}

setInterval(createLeaf, 500);

// Search functionality
function searchGoogle() {
  const query = document.querySelector('.search-box input').value;
  if (query) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
  }
}

// App opening functionality
function openApp(url) {
  window.open(url, '_blank');
}

// Spotify Auth and Player Logic
// Using Authorization Code with PKCE flow (modern approach)
// Reference: https://developer.spotify.com/documentation/web-api
const clientId = 'fd061c95ff4342eda082dd1f8a3eeaec';
const clientSecret = '14a38d3c65e147279cd776d81c511425';
const redirectUri = 'https://mytoolengine.netlify.app/';
const scopes = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
];

let player, deviceId, accessToken;
let seekBarUpdateTimer = null; // Timer for updating seek bar
let currentTrackDuration = 0; // Store current track duration
let isConnecting = false; // Prevent multiple connection attempts
let currentTrackId = null; // Track the current playing song ID
let similarSongsQueue = []; // Queue of similar songs to play
let isAutoPlayingSimilar = false; // Flag to prevent infinite loops

// PKCE (Proof Key for Code Exchange) functions
function generateCodeVerifier(length) {
  let text = '';
  let possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Store PKCE values
let codeVerifier = '';
let codeChallenge = '';

// Define the callback before the SDK loads
window.onSpotifyWebPlaybackSDKReady = () => {
  console.log('Spotify Web Playback SDK is ready');
  if (accessToken && !player && !isConnecting) {
    setupPlayer();
  }
};

function getHashParams() {
  const hash = window.location.hash.substring(1);
  const params = {};
  hash.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    params[k] = v;
  });
  return params;
}

function getQueryParams() {
  const query = window.location.search.substring(1);
  const params = {};
  query.split('&').forEach(kv => {
    const [k, v] = kv.split('=');
    params[k] = v;
  });
  return params;
}

// Store the access token in localStorage for persistent login
function saveSpotifyToken(token) {
  localStorage.setItem('spotify_access_token', token);
}

function getSavedSpotifyToken() {
  return localStorage.getItem('spotify_access_token');
}

function clearSpotifyToken() {
  localStorage.removeItem('spotify_access_token');
}

async function checkTokenValidity(token) {
  try {
    console.log('Checking token validity...');
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('Token validation response status:', response.status);
    
    if (response.status === 403) {
      console.error('403 Forbidden - This usually means insufficient scopes or account restrictions');
      const errorText = await response.text();
      console.error('403 Error details:', errorText);
      return false;
    }
    
    if (response.status === 401) {
      console.error('401 Unauthorized - Token is invalid or expired');
      return false;
    }
    
    if (!response.ok) {
      console.error(`Token validation failed with status: ${response.status}`);
      return false;
    }
    
    const userData = await response.json();
    console.log('Token is valid for user:', userData.display_name);
    return true;
    
  } catch (error) {
    console.error('Error checking token validity:', error);
    return false;
  }
}

async function makeSpotifyRequest(url, options = {}) {
  if (!accessToken) {
    throw new Error('No access token available');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers
    }
  });

  if (response.status === 401) {
    // Token expired, clear it and throw error
    console.error('401 Unauthorized - Token expired');
    clearSpotifyToken();
    accessToken = null;
    player = null;
    document.getElementById('login-btn').hidden = false;
    updateStatus('Session expired. Please login again.', true);
    throw new Error('Authentication expired');
  }

  if (response.status === 403) {
    // Forbidden - usually means insufficient scopes
    console.error('403 Forbidden - Insufficient scopes or account restrictions');
    const errorText = await response.text();
    console.error('403 Error details:', errorText);
    updateStatus('Access denied. Please check your Spotify account permissions.', true);
    throw new Error('Insufficient permissions');
  }

  return response;
}

// Client Credentials Authentication (no user login required)
async function getClientCredentialsToken() {
  try {
    console.log('Getting client credentials token...');
    updateStatus('Authenticating with Spotify...');
    
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Client credentials token received');
    
    // Store the access token
    accessToken = data.access_token;
    saveSpotifyToken(accessToken);
    
    return data.access_token;
    
  } catch (error) {
    console.error('Error getting client credentials token:', error);
    updateStatus('Authentication failed. Please check your credentials.', true);
    throw error;
  }
}

// Simplified login function that uses client credentials
async function loginWithSpotify() {
  // Clear any existing errors
  updateStatus('Preparing Spotify authentication...');
  
  try {
    // Generate PKCE values
    codeVerifier = generateCodeVerifier(128);
    codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store code verifier in session storage
    sessionStorage.setItem('spotify_code_verifier', codeVerifier);
    
    // Use Authorization Code flow with PKCE
    const responseType = 'code';
    const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join('%20')}&response_type=${responseType}&code_challenge=${codeChallenge}&code_challenge_method=S256&show_dialog=true`;
    
    console.log('=== SPOTIFY AUTH DEBUG (PKCE) ===');
    console.log('Client ID:', clientId);
    console.log('Redirect URI:', redirectUri);
    console.log('Response Type:', responseType);
    console.log('Code Challenge Method: S256');
    console.log('Full URL:', url);
    console.log('================================');
    
    updateStatus('Redirecting to Spotify...');
    window.location = url;
    
  } catch (error) {
    console.error('Error preparing Spotify auth:', error);
    updateStatus('Failed to prepare authentication. Please try again.', true);
  }
}

async function exchangeCodeForToken(code) {
  try {
    updateStatus('Exchanging authorization code for token...');
    
    // Get the stored code verifier
    const storedCodeVerifier = sessionStorage.getItem('spotify_code_verifier');
    if (!storedCodeVerifier) {
      throw new Error('Code verifier not found in session storage');
    }
    
    // Exchange code for token
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: storedCodeVerifier,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Token exchange failed: ${errorData.error_description || errorData.error}`);
    }
    
    const data = await response.json();
    console.log('Token exchange successful');
    
    // Store the access token
    accessToken = data.access_token;
    saveSpotifyToken(accessToken);
    
    // Clean up session storage
    sessionStorage.removeItem('spotify_code_verifier');
    
    return data.access_token;
    
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    updateStatus('Token exchange failed. Please try again.', true);
    throw error;
  }
}

function msToTime(ms) {
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function extractSpotifyPlaylistId(url) {
  // Accepts full URL, URI, or just ID
  if (!url) return '';
  // URL: https://open.spotify.com/playlist/PLAYLIST_ID
  const urlMatch = url.match(/playlist[\/:]([a-zA-Z0-9]+)(\?.*)?$/);
  if (urlMatch && urlMatch[1]) return urlMatch[1];
  // URI: spotify:playlist:PLAYLIST_ID
  const uriMatch = url.match(/playlist:([a-zA-Z0-9]+)/);
  if (uriMatch && uriMatch[1]) return uriMatch[1];
  // Raw ID
  if (/^[a-zA-Z0-9]{22}$/.test(url)) return url;
  return '';
}

// --- Glossy Equalizer Bar Logic ---
function createGlossyEqBars() {
  const eqContainer = document.getElementById('glossy-eq-bars');
  const colors = ['red','orange','yellow','green','cyan','blue','purple'];
  const barCount = 32;
  eqContainer.innerHTML = '';
  for (let i = 0; i < barCount; i++) {
    const bar = document.createElement('div');
    // Assign a color class in a rainbow pattern
    bar.className = 'glossy-eq-bar ' + colors[Math.floor(i/(barCount/colors.length))];
    bar.style.height = '30%';
    eqContainer.appendChild(bar);
  }
}

let glossyEqAnimTimer = null;
function animateGlossyEqBars(isPlaying) {
  const bars = document.querySelectorAll('.glossy-eq-bar');
  if (glossyEqAnimTimer) clearInterval(glossyEqAnimTimer);
  if (!isPlaying) {
    // Set all bars to a low, idle state
    bars.forEach(bar => bar.style.height = (20 + Math.random()*10) + '%');
    return;
  }
  glossyEqAnimTimer = setInterval(() => {
    bars.forEach((bar, i) => {
      // Rainbow wave pattern, glossy look
      const base = 40 + 30*Math.abs(Math.sin(Date.now()/400 + i/2));
      const gloss = 10 + 10*Math.abs(Math.cos(Date.now()/200 + i));
      bar.style.height = (base + gloss + Math.random()*10) + '%';
    });
  }, 120);
}

// --- Update player UI to use glossy eq bars ---
function updatePlayerUI(state) {
  if (!state) {
    document.getElementById('player-title').textContent = 'Spotify Music Player';
    document.getElementById('current-time').textContent = '00:00';
    document.getElementById('duration').textContent = '00:00';
    document.getElementById('seek-bar').value = 0;
    document.getElementById('seek-bar').max = 100;
    animateGlossyEqBars(false);
    updateSeekBarProgress(0, 100);
    return;
  }
  const track = state.track_window.current_track;
  const position = state.position;
  const duration = track.duration_ms;
  
  // Update current track ID
  currentTrackId = track.id;
  
  document.getElementById('player-title').textContent = track.name;
  const artwork = document.getElementById('player-artwork');
  if (track.album.images.length > 0) artwork.src = track.album.images[0].url;
  document.getElementById('current-time').textContent = msToTime(position);
  document.getElementById('duration').textContent = msToTime(duration);
  const seekBar = document.getElementById('seek-bar');
  seekBar.max = duration;
  seekBar.value = position;
  animateGlossyEqBars(!state.paused);
  updateSeekBarProgress(position, duration);
  const playBtn = document.getElementById('play-btn');
  playBtn.textContent = state.paused ? '▶️' : '⏸️';
  if (!state.paused) {
    startSeekBarTimer();
  } else {
    stopSeekBarTimer();
  }
}

function startSeekBarTimer() {
  if (seekBarUpdateTimer) {
    clearInterval(seekBarUpdateTimer);
  }
  
  seekBarUpdateTimer = setInterval(() => {
    if (player) {
      player.getCurrentState().then(state => {
        if (state && !state.paused) {
          const position = state.position;
          const duration = state.track_window.current_track.duration_ms;
          
          // Update seek bar
          document.getElementById('seek-bar').value = position;
          document.getElementById('current-time').textContent = msToTime(position);
          
          // Update histogram animation
          animateGlossyEqBars(true);
          
          // Update seek bar progress
          updateSeekBarProgress(position, duration);
        }
      });
    }
  }, 1000);
}

function stopSeekBarTimer() {
  if (seekBarUpdateTimer) {
    clearInterval(seekBarUpdateTimer);
    seekBarUpdateTimer = null;
  }
  
  // Update histogram to paused state
  animateGlossyEqBars(false);
}

function updateStatus(message, isError = false) {
  const statusElement = document.getElementById('status-message');
  statusElement.textContent = message;
  statusElement.style.color = isError ? '#ff4444' : '#1DB954';
}

function showLoading(show) {
  const loadingIndicator = document.getElementById('loading-indicator');
  const loadButton = document.getElementById('spotify-url-btn');
  
  if (show) {
    loadingIndicator.style.display = 'block';
    loadButton.disabled = true;
    loadButton.textContent = 'Loading';
  } else {
    loadingIndicator.style.display = 'none';
    loadButton.disabled = false;
    loadButton.textContent = 'Load';
  }
}

// --- Patch setupPlayer ---
const originalSetupPlayer = setupPlayer;
setupPlayer = function() {
  originalSetupPlayer.apply(this, arguments);
  setTimeout(() => updateDeviceList(), 1200);
};

// --- Patch initialization ---
document.addEventListener('DOMContentLoaded', function() {
  console.log('=== SPOTIFY MUSIC PLAYER INITIALIZATION ===');
  
  // Check if we're returning from Spotify auth
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  if (error) {
    console.error('Auth error:', error);
    updateStatus(`Authentication failed: ${error}`, true);
    return;
  }
  
  if (code) {
    console.log('Auth code received, exchanging for tokens...');
    exchangeCodeForToken(code);
  } else {
    // Check for existing tokens
    const existingToken = sessionStorage.getItem('spotify_access_token');
    const tokenExpiry = sessionStorage.getItem('spotify_token_expiry');
    
    if (existingToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      console.log('Using existing valid token');
      accessToken = existingToken;
      setupPlayer();
      fetchUserPlaylists();
      setTimeout(() => updateDeviceList(), 1200);
    } else {
      console.log('No valid token found, showing login');
      showLoginInterface();
    }
  }
  
  // Setup event listeners
  setupEventListeners();
});

function showLoginInterface() {
  const loginBtn = document.getElementById('login-btn');
  const switchAccountBtn = document.getElementById('switch-account-btn');
  
  if (loginBtn) {
    loginBtn.hidden = false;
  }
  
  if (switchAccountBtn) {
    switchAccountBtn.hidden = false;
  }
  
  updateStatus('Login to Spotify to start playing music!');
}

// Load featured playlists that any user can access
async function loadFeaturedPlaylists() {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    updateStatus('Loading featured playlists...');
    
    // Try multiple endpoints to get playlists
    let playlists = [];
    
    // First try: Get new releases (which are always available)
    try {
      const newReleasesResponse = await fetch('https://api.spotify.com/v1/browse/new-releases?limit=10', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (newReleasesResponse.ok) {
        const data = await newReleasesResponse.json();
        // Convert albums to playlist-like format
        playlists = data.albums.items.map(album => ({
          name: `New Release: ${album.name}`,
          owner: { display_name: album.artists[0]?.name || 'Various Artists' },
          images: album.images,
          uri: album.uri,
          id: album.id
        }));
        console.log('Loaded new releases as playlists');
      }
    } catch (error) {
      console.log('New releases endpoint failed, trying alternatives...');
    }
    
    // If no new releases, try categories
    if (playlists.length === 0) {
      try {
        const categoriesResponse = await fetch('https://api.spotify.com/v1/browse/categories?limit=10', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (categoriesResponse.ok) {
          const data = await categoriesResponse.json();
          // Convert categories to playlist-like format
          playlists = data.categories.items.map(category => ({
            name: `Category: ${category.name}`,
            owner: { display_name: 'Spotify' },
            images: category.icons,
            uri: `spotify:category:${category.id}`,
            id: category.id
          }));
          console.log('Loaded categories as playlists');
        }
      } catch (error) {
        console.log('Categories endpoint failed...');
      }
    }
    
    // If still no playlists, create some default ones
    if (playlists.length === 0) {
      playlists = [
        {
          name: 'Popular Songs',
          owner: { display_name: 'Spotify' },
          images: [{ url: 'https://via.placeholder.com/45x45?text=🎵' }],
          uri: 'spotify:playlist:37i9dQZEVXbMDoHDwVN2tF', // Global Top 50
          id: 'popular'
        },
        {
          name: 'Trending Now',
          owner: { display_name: 'Spotify' },
          images: [{ url: 'https://via.placeholder.com/45x45?text=🔥' }],
          uri: 'spotify:playlist:37i9dQZEVXbMDoHDwVN2tF',
          id: 'trending'
        }
      ];
      console.log('Using default playlists');
    }
    
    displayFeaturedPlaylists(playlists);
    updateStatus(`Loaded ${playlists.length} playlists`);

  } catch (error) {
    console.error('Error fetching playlists:', error);
    updateStatus('Failed to load playlists. Please try again.', true);
    
    // Show some default playlists even if API fails
    const defaultPlaylists = [
      {
        name: 'Search for Music',
        owner: { display_name: 'Use the search above' },
        images: [{ url: 'https://via.placeholder.com/45x45?text=🔍' }],
        uri: 'search',
        id: 'search'
      }
    ];
    displayFeaturedPlaylists(defaultPlaylists);
  }
}

function displayFeaturedPlaylists(playlists) {
  const container = document.getElementById('playlists-container');
  
  if (!playlists || playlists.length === 0) {
    container.innerHTML = '<div class="no-playlists">No featured playlists found.</div>';
    return;
  }

  const playlistsHTML = playlists.map(playlist => `
    <div class="playlist-item">
      <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/45x45?text=🎵'}" alt="${playlist.name}">
      <div class="playlist-info">
        <div class="playlist-name">${playlist.name}</div>
        <div class="playlist-owner">by ${playlist.owner.display_name}</div>
      </div>
      <button class="playlist-play" onclick="playPlaylist('${playlist.uri}')" title="Play Playlist">▶️</button>
    </div>
  `).join('');

  container.innerHTML = playlistsHTML;
}

// --- Device Selection ---
async function fetchAvailableDevices() {
  if (!accessToken) return [];
  try {
    const response = await makeSpotifyRequest('https://api.spotify.com/v1/me/player/devices');
    if (!response.ok) throw new Error('Failed to fetch devices');
    const data = await response.json();
    return data.devices || [];
  } catch (e) {
    console.error('Error fetching devices:', e);
    return [];
  }
}

function showDeviceSelector(devices) {
  let container = document.getElementById('device-selector-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'device-selector-container';
    container.style.margin = '10px 0';
    const playerInfo = document.querySelector('.player-info');
    if (playerInfo) playerInfo.insertBefore(container, playerInfo.firstChild);
  }
  if (!devices.length) {
    container.innerHTML = '<div style="color: #b00; font-size: 13px;">No active Spotify device found.<br>Open the Spotify app on your PC/phone and start playing any song once, then click <b>Refresh Devices</b>.</div>' +
      '<button id="refresh-devices-btn" style="margin-top:6px;">Refresh Devices</button>';
    document.getElementById('refresh-devices-btn').onclick = updateDeviceList;
    return;
  }
  let html = '<label for="device-select">Playback Device:</label> <select id="device-select">';
  devices.forEach(d => {
    html += `<option value="${d.id}"${d.is_active ? ' selected' : ''}>${d.name} (${d.type}${d.is_active ? ', Active' : ''})</option>`;
  });
  html += '</select>';
  html += ' <button id="refresh-devices-btn">Refresh Devices</button>';
  container.innerHTML = html;
  document.getElementById('device-select').onchange = function() {
    deviceId = this.value;
    updateStatus('Selected device: ' + this.options[this.selectedIndex].text);
  };
  document.getElementById('refresh-devices-btn').onclick = updateDeviceList;
}

async function updateDeviceList() {
  const devices = await fetchAvailableDevices();
  if (devices.length) {
    // Default to first device if none selected
    if (!deviceId || !devices.some(d => d.id === deviceId)) {
      deviceId = devices[0].id;
    }
  }
  showDeviceSelector(devices);
}

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices

// --- Playlist Management Functions ---
async function fetchUserPlaylists() {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    updateStatus('Loading your playlists...');
    
    // Fetch user's playlists (limit to 20 for performance)
    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      displayUserPlaylists(data.items);
      updateStatus(`Loaded ${data.items.length} playlists`);
    } else if (response.status === 403) {
      // For free accounts, playlist access might be restricted
      console.log('Playlist access restricted (free account limitation)');
      displayUserPlaylists([]);
      updateStatus('Playlist access not available with free account');
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.error('Error fetching playlists:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to load playlists. Please try again.', true);
    }
  }
}

function displayUserPlaylists(playlists) {
  const container = document.getElementById('playlists-container');
  
  if (!playlists || playlists.length === 0) {
    container.innerHTML = '<div class="no-playlists">No playlists found. Create some playlists in Spotify!</div>';
    return;
  }

  const playlistsHTML = playlists.map(playlist => `
    <div class="playlist-item">
      <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/45x45?text=🎵'}" alt="${playlist.name}">
      <div class="playlist-info">
        <div class="playlist-name">${playlist.name}</div>
        <div class="playlist-owner">by ${playlist.owner.display_name}</div>
      </div>
      <button class="playlist-play" onclick="playPlaylist('${playlist.uri}')" title="Play Playlist">▶️</button>
    </div>
  `).join('');

  container.innerHTML = playlistsHTML;
}

// Debug function to help troubleshoot authentication issues
async function debugSpotifyAuth() {
  console.log('=== SPOTIFY AUTH DEBUG ===');
  console.log('Client ID:', clientId);
  console.log('Redirect URI:', redirectUri);
  console.log('Access Token exists:', !!accessToken);
  console.log('Access Token length:', accessToken ? accessToken.length : 0);
  
  if (accessToken) {
    try {
      console.log('Testing token with search endpoint...');
      const response = await fetch('https://api.spotify.com/v1/search?q=test&type=track&limit=1', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data = await response.json();
        console.log('Search test successful:', data);
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('Error testing token:', error);
    }
  }
  
  console.log('=== END DEBUG ===');
}

// Add debug function to window for console access
window.debugSpotifyAuth = debugSpotifyAuth;

// Function to completely clear all authentication data
function clearAllAuthData() {
  console.log('Clearing all authentication data...');
  
  // Clear tokens
  clearSpotifyToken();
  sessionStorage.removeItem('spotify_code_verifier');
  
  // Clear variables
  accessToken = null;
  currentTrackId = null;
  codeVerifier = '';
  codeChallenge = '';
  
  // Disconnect player
  if (player && player.disconnect) {
    player.disconnect();
  }
  player = null;
  deviceId = null;
  
  // Clear similar songs queue
  clearSimilarSongsQueue();
  
  // Reset UI - check if elements exist first
  const loginBtn = document.getElementById('login-btn');
  const switchAccountBtn = document.getElementById('switch-account-btn');
  const playlistsContainer = document.getElementById('playlists-container');
  
  if (loginBtn) {
    loginBtn.hidden = false;
  }
  
  if (switchAccountBtn) {
    switchAccountBtn.hidden = true;
  }
  
  if (playlistsContainer) {
    playlistsContainer.innerHTML = '<div class="loading-playlists">Loading featured playlists...</div>';
  }
  
  showSearchResults(false);
  animateGlossyEqBars(false);
  
  // Clear URL parameters
  window.history.replaceState({}, document.title, window.location.pathname);
  
  updateStatus('All authentication data cleared. Please login again.');
  
  console.log('All authentication data cleared');
}

// Add to window for console access
window.clearAllAuthData = clearAllAuthData;

function updateSeekBarProgress(currentTime, duration) {
  const progressBar = document.getElementById('seek-bar-progress');
  if (duration > 0) {
    const progress = (currentTime / duration) * 100;
    progressBar.style.width = `${progress}%`;
  }
}

function testSpotifyAuth() {
  // Test function to check if the auth URL is valid
  const responseType = 'code';
  const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join('%20')}&response_type=${responseType}&code_challenge=${codeChallenge}&code_challenge_method=S256&show_dialog=true`;
  
  console.log('=== AUTH URL TEST (PKCE) ===');
  console.log('URL:', url);
  console.log('URL Length:', url.length);
  console.log('Client ID Valid:', /^[a-f0-9]{32}$/.test(clientId));
  console.log('Redirect URI Valid:', redirectUri.startsWith('https://'));
  console.log('Code Challenge:', codeChallenge);
  console.log('===========================');
  
  // Open URL in new tab for testing
  window.open(url, '_blank');
}

// --- Auto-play similar songs logic ---
async function getSimilarSongsForQueue(trackId) {
  if (!trackId || !accessToken) return [];
  
  try {
    // Get track audio features first
    const featuresResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/audio-features/${trackId}`);
    if (!featuresResponse.ok) return [];
    
    const features = await featuresResponse.json();
    
    // Get recommendations based on the track
    const recommendationsResponse = await makeSpotifyRequest(
      `https://api.spotify.com/v1/recommendations?seed_tracks=${trackId}&limit=10&target_danceability=${features.danceability}&target_energy=${features.energy}&target_valence=${features.valence}`
    );
    
    if (!recommendationsResponse.ok) return [];
    
    const recommendations = await recommendationsResponse.json();
    return recommendations.tracks;
    
  } catch (error) {
    console.error('Error getting similar songs for queue:', error);
    return [];
  }
}

async function playNextSimilarSong() {
  if (similarSongsQueue.length === 0 || isAutoPlayingSimilar) return;
  
  isAutoPlayingSimilar = true;
  const nextSong = similarSongsQueue.shift(); // Get and remove the first song
  
  try {
    updateStatus(`Playing next: ${nextSong.name} - ${nextSong.artists.map(a => a.name).join(', ')}`);
    
    const response = await makeSpotifyRequest(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [nextSong.uri]
      })
    });
    
    if (response.ok) {
      currentTrackId = nextSong.id;
      updateStatus(`Now playing: ${nextSong.name} - ${nextSong.artists.map(a => a.name).join(', ')} (${similarSongsQueue.length} more in queue)`);
      
      // Get more similar songs for the queue when this song starts
      setTimeout(async () => {
        const moreSimilarSongs = await getSimilarSongsForQueue(nextSong.id);
        similarSongsQueue.push(...moreSimilarSongs);
        console.log(`Added ${moreSimilarSongs.length} more similar songs to queue. Total: ${similarSongsQueue.length}`);
      }, 2000);
    }
    
  } catch (error) {
    console.error('Error playing next similar song:', error);
    updateStatus('Failed to play next song', true);
  } finally {
    isAutoPlayingSimilar = false;
  }
}

function clearSimilarSongsQueue() {
  similarSongsQueue = [];
  currentTrackId = null;
  isAutoPlayingSimilar = false;
  console.log('Similar songs queue cleared');
}

function getQueueStatus() {
  return {
    currentTrack: currentTrackId,
    queueLength: similarSongsQueue.length,
    isAutoPlaying: isAutoPlayingSimilar
  };
}

// --- Playlist Management Functions ---
async function fetchUserPlaylists() {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    updateStatus('Loading your playlists...');
    
    // Fetch user's playlists (limit to 20 for performance)
    const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=20', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      displayUserPlaylists(data.items);
      updateStatus(`Loaded ${data.items.length} playlists`);
    } else if (response.status === 403) {
      // For free accounts, playlist access might be restricted
      console.log('Playlist access restricted (free account limitation)');
      displayUserPlaylists([]);
      updateStatus('Playlist access not available with free account');
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    console.error('Error fetching playlists:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to load playlists. Please try again.', true);
    }
  }
}

function displayUserPlaylists(playlists) {
  const container = document.getElementById('playlists-container');
  
  if (!playlists || playlists.length === 0) {
    container.innerHTML = '<div class="no-playlists">No playlists found. Create some playlists in Spotify!</div>';
    return;
  }

  const playlistsHTML = playlists.map(playlist => `
    <div class="playlist-item">
      <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/45x45?text=🎵'}" alt="${playlist.name}">
      <div class="playlist-info">
        <div class="playlist-name">${playlist.name}</div>
        <div class="playlist-owner">by ${playlist.owner.display_name}</div>
      </div>
      <button class="playlist-play" onclick="playPlaylist('${playlist.uri}')" title="Play Playlist">▶️</button>
    </div>
  `).join('');

  container.innerHTML = playlistsHTML;
}

// Debug function to help troubleshoot authentication issues
async function debugSpotifyAuth() {
  console.log('=== SPOTIFY AUTH DEBUG ===');
  console.log('Client ID:', clientId);
  console.log('Redirect URI:', redirectUri);
  console.log('Access Token exists:', !!accessToken);
  console.log('Access Token length:', accessToken ? accessToken.length : 0);
  
  if (accessToken) {
    try {
      console.log('Testing token with search endpoint...');
      const response = await fetch('https://api.spotify.com/v1/search?q=test&type=track&limit=1', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      if (response.ok) {
        const data = await response.json();
        console.log('Search test successful:', data);
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('Error testing token:', error);
    }
  }
  
  console.log('=== END DEBUG ===');
}

// Add debug function to window for console access
window.debugSpotifyAuth = debugSpotifyAuth;

// Function to completely clear all authentication data
function clearAllAuthData() {
  console.log('Clearing all authentication data...');
  
  // Clear tokens
  clearSpotifyToken();
  sessionStorage.removeItem('spotify_code_verifier');
  
  // Clear variables
  accessToken = null;
  currentTrackId = null;
  codeVerifier = '';
  codeChallenge = '';
  
  // Disconnect player
  if (player && player.disconnect) {
    player.disconnect();
  }
  player = null;
  deviceId = null;
  
  // Clear similar songs queue
  clearSimilarSongsQueue();
  
  // Reset UI - check if elements exist first
  const loginBtn = document.getElementById('login-btn');
  const switchAccountBtn = document.getElementById('switch-account-btn');
  const playlistsContainer = document.getElementById('playlists-container');
  
  if (loginBtn) {
    loginBtn.hidden = false;
  }
  
  if (switchAccountBtn) {
    switchAccountBtn.hidden = true;
  }
  
  if (playlistsContainer) {
    playlistsContainer.innerHTML = '<div class="loading-playlists">Loading featured playlists...</div>';
  }
  
  showSearchResults(false);
  animateGlossyEqBars(false);
  
  // Clear URL parameters
  window.history.replaceState({}, document.title, window.location.pathname);
  
  updateStatus('All authentication data cleared. Please login again.');
  
  console.log('All authentication data cleared');
}

// Add to window for console access
window.clearAllAuthData = clearAllAuthData;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', function() {
  console.log('=== SPOTIFY MUSIC PLAYER INITIALIZATION ===');
  
  // Check if we're returning from Spotify auth
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const error = urlParams.get('error');
  
  if (error) {
    console.error('Auth error:', error);
    updateStatus(`Authentication failed: ${error}`, true);
    return;
  }
  
  if (code) {
    console.log('Auth code received, exchanging for tokens...');
    exchangeCodeForToken(code);
  } else {
    // Check for existing tokens
    const existingToken = sessionStorage.getItem('spotify_access_token');
    const tokenExpiry = sessionStorage.getItem('spotify_token_expiry');
    
    if (existingToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
      console.log('Using existing valid token');
      accessToken = existingToken;
      setupPlayer();
      fetchUserPlaylists();
      setTimeout(() => updateDeviceList(), 1200);
    } else {
      console.log('No valid token found, showing login');
      showLoginInterface();
    }
  }
  
  // Setup event listeners
  setupEventListeners();
});

function showLoginInterface() {
  const loginBtn = document.getElementById('login-btn');
  const switchAccountBtn = document.getElementById('switch-account-btn');
  
  if (loginBtn) {
    loginBtn.hidden = false;
  }
  
  if (switchAccountBtn) {
    switchAccountBtn.hidden = false;
  }
  
  updateStatus('Login to Spotify to start playing music!');
}

// Load featured playlists that any user can access
async function loadFeaturedPlaylists() {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    updateStatus('Loading featured playlists...');
    
    // Try multiple endpoints to get playlists
    let playlists = [];
    
    // First try: Get new releases (which are always available)
    try {
      const newReleasesResponse = await fetch('https://api.spotify.com/v1/browse/new-releases?limit=10', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (newReleasesResponse.ok) {
        const data = await newReleasesResponse.json();
        // Convert albums to playlist-like format
        playlists = data.albums.items.map(album => ({
          name: `New Release: ${album.name}`,
          owner: { display_name: album.artists[0]?.name || 'Various Artists' },
          images: album.images,
          uri: album.uri,
          id: album.id
        }));
        console.log('Loaded new releases as playlists');
      }
    } catch (error) {
      console.log('New releases endpoint failed, trying alternatives...');
    }
    
    // If no new releases, try categories
    if (playlists.length === 0) {
      try {
        const categoriesResponse = await fetch('https://api.spotify.com/v1/browse/categories?limit=10', {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });
        
        if (categoriesResponse.ok) {
          const data = await categoriesResponse.json();
          // Convert categories to playlist-like format
          playlists = data.categories.items.map(category => ({
            name: `Category: ${category.name}`,
            owner: { display_name: 'Spotify' },
            images: category.icons,
            uri: `spotify:category:${category.id}`,
            id: category.id
          }));
          console.log('Loaded categories as playlists');
        }
      } catch (error) {
        console.log('Categories endpoint failed...');
      }
    }
    
    // If still no playlists, create some default ones
    if (playlists.length === 0) {
      playlists = [
        {
          name: 'Popular Songs',
          owner: { display_name: 'Spotify' },
          images: [{ url: 'https://via.placeholder.com/45x45?text=🎵' }],
          uri: 'spotify:playlist:37i9dQZEVXbMDoHDwVN2tF', // Global Top 50
          id: 'popular'
        },
        {
          name: 'Trending Now',
          owner: { display_name: 'Spotify' },
          images: [{ url: 'https://via.placeholder.com/45x45?text=🔥' }],
          uri: 'spotify:playlist:37i9dQZEVXbMDoHDwVN2tF',
          id: 'trending'
        }
      ];
      console.log('Using default playlists');
    }
    
    displayFeaturedPlaylists(playlists);
    updateStatus(`Loaded ${playlists.length} playlists`);

  } catch (error) {
    console.error('Error fetching playlists:', error);
    updateStatus('Failed to load playlists. Please try again.', true);
    
    // Show some default playlists even if API fails
    const defaultPlaylists = [
      {
        name: 'Search for Music',
        owner: { display_name: 'Use the search above' },
        images: [{ url: 'https://via.placeholder.com/45x45?text=🔍' }],
        uri: 'search',
        id: 'search'
      }
    ];
    displayFeaturedPlaylists(defaultPlaylists);
  }
}

function displayFeaturedPlaylists(playlists) {
  const container = document.getElementById('playlists-container');
  
  if (!playlists || playlists.length === 0) {
    container.innerHTML = '<div class="no-playlists">No featured playlists found.</div>';
    return;
  }

  const playlistsHTML = playlists.map(playlist => `
    <div class="playlist-item">
      <img src="${playlist.images[0]?.url || 'https://via.placeholder.com/45x45?text=🎵'}" alt="${playlist.name}">
      <div class="playlist-info">
        <div class="playlist-name">${playlist.name}</div>
        <div class="playlist-owner">by ${playlist.owner.display_name}</div>
      </div>
      <button class="playlist-play" onclick="playPlaylist('${playlist.uri}')" title="Play Playlist">▶️</button>
    </div>
  `).join('');

  container.innerHTML = playlistsHTML;
}

// --- Device Selection ---
async function fetchAvailableDevices() {
  if (!accessToken) return [];
  try {
    const response = await makeSpotifyRequest('https://api.spotify.com/v1/me/player/devices');
    if (!response.ok) throw new Error('Failed to fetch devices');
    const data = await response.json();
    return data.devices || [];
  } catch (e) {
    console.error('Error fetching devices:', e);
    return [];
  }
}

function showDeviceSelector(devices) {
  let container = document.getElementById('device-selector-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'device-selector-container';
    container.style.margin = '10px 0';
    const playerInfo = document.querySelector('.player-info');
    if (playerInfo) playerInfo.insertBefore(container, playerInfo.firstChild);
  }
  if (!devices.length) {
    container.innerHTML = '<div style="color: #b00; font-size: 13px;">No active Spotify device found.<br>Open the Spotify app on your PC/phone and start playing any song once, then click <b>Refresh Devices</b>.</div>' +
      '<button id="refresh-devices-btn" style="margin-top:6px;">Refresh Devices</button>';
    document.getElementById('refresh-devices-btn').onclick = updateDeviceList;
    return;
  }
  let html = '<label for="device-select">Playback Device:</label> <select id="device-select">';
  devices.forEach(d => {
    html += `<option value="${d.id}"${d.is_active ? ' selected' : ''}>${d.name} (${d.type}${d.is_active ? ', Active' : ''})</option>`;
  });
  html += '</select>';
  html += ' <button id="refresh-devices-btn">Refresh Devices</button>';
  container.innerHTML = html;
  document.getElementById('device-select').onchange = function() {
    deviceId = this.value;
    updateStatus('Selected device: ' + this.options[this.selectedIndex].text);
  };
  document.getElementById('refresh-devices-btn').onclick = updateDeviceList;
}

async function updateDeviceList() {
  const devices = await fetchAvailableDevices();
  if (devices.length) {
    // Default to first device if none selected
    if (!deviceId || !devices.some(d => d.id === deviceId)) {
      deviceId = devices[0].id;
    }
  }
  showDeviceSelector(devices);
}

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices

// Call updateDeviceList after login and after player setup
// In initialization, after setupPlayer():
// setTimeout(() => updateDeviceList(), 1200);
// Also call updateDeviceList when user clicks refresh devices 