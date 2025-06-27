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
const redirectUri = 'https://mytoolengine.netlify.app/';
const scopes = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-read-recently-played',
  'user-top-read',
];
let player, deviceId, accessToken;
let seekBarUpdateTimer = null; // Timer for updating seek bar
let currentTrackDuration = 0; // Store current track duration
let isConnecting = false; // Prevent multiple connection attempts

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
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return response.ok;
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
    clearSpotifyToken();
    accessToken = null;
    player = null;
    document.getElementById('login-btn').hidden = false;
    updateStatus('Session expired. Please login again.', true);
    throw new Error('Authentication expired');
  }

  return response;
}

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

function setupPlayer() {
  if (!accessToken) {
    console.error('No access token available');
    updateStatus('No access token available', true);
    return;
  }
  
  // Prevent multiple setup attempts
  if (player || isConnecting) {
    console.log('Player already exists or connecting, skipping setup');
    return;
  }
  
  isConnecting = true;
  updateStatus('Connecting to Spotify...');
  
  // Check if SDK is already loaded
  if (typeof Spotify === 'undefined') {
    console.error('Spotify Web Playback SDK not loaded');
    updateStatus('Spotify SDK not loaded. Please refresh the page.', true);
    isConnecting = false;
    return;
  }
  
  player = new Spotify.Player({
    name: 'Web Player',
    getOAuthToken: cb => { cb(accessToken); },
    volume: 0.5
  });
  
  player.addListener('ready', ({ device_id }) => {
    console.log('Player ready with device ID:', device_id);
    deviceId = device_id;
    updateStatus('Connected! Ready to play music.');
    
    // Transfer playback to this device
    makeSpotifyRequest('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        device_ids: [deviceId], 
        play: false 
      })
    }).then(response => {
      if (!response.ok) {
        console.error('Failed to transfer playback:', response.status);
      }
    }).catch(error => {
      console.error('Error transferring playback:', error);
    });
  });
  
  player.addListener('not_ready', ({ device_id }) => {
    console.log('Device ID has gone offline', device_id);
    updateStatus('Player disconnected', true);
    stopSeekBarTimer(); // Stop timer when player disconnects
  });
  
  player.addListener('initialization_error', ({ message }) => {
    console.error('Failed to initialize player:', message);
    updateStatus('Failed to initialize player', true);
    player = null; // Reset player on initialization error
  });
  
  player.addListener('authentication_error', ({ message }) => {
    console.error('Failed to authenticate:', message);
    updateStatus('Authentication failed. Please login again.', true);
    player = null; // Reset player on auth error
    // Clear token and show login button
    clearSpotifyToken();
    accessToken = null;
    document.getElementById('login-btn').hidden = false;
  });
  
  player.addListener('account_error', ({ message }) => {
    console.error('Failed to validate Spotify account:', message);
    updateStatus('Account error. Please check your Spotify Premium status.', true);
    player = null; // Reset player on account error
  });
  
  player.addListener('playback_error', ({ message }) => {
    console.error('Failed to perform playback:', message);
    updateStatus('Playback error occurred', true);
  });
  
  player.addListener('player_state_changed', state => {
    console.log('Player state changed:', state);
    updatePlayerUI(state);
    
    if (state) {
      updateStatus('Now playing');
    } else {
      // No state means no track is playing
      stopSeekBarTimer();
      updateStatus('No track playing');
    }
  });
  
  player.connect().then(success => {
    if (success) {
      console.log('Successfully connected to Spotify!');
      updateStatus('Welcome back! You can now search for songs and discover similar music.');
    } else {
      updateStatus('Failed to connect to Spotify', true);
      player = null; // Reset player on connection failure
    }
  }).catch(error => {
    console.error('Connection error:', error);
    updateStatus('Connection failed. Please try again.', true);
    player = null; // Reset player on connection error
  }).finally(() => {
    isConnecting = false;
  });
}

function loadPlaylist(playlistId) {
  if (!deviceId || !accessToken) {
    console.error('Device ID or access token not available');
    updateStatus('Player not ready. Please wait...', true);
    return;
  }
  
  console.log('Loading playlist:', playlistId);
  showLoading(true);
  updateStatus('Loading playlist...');
  
  // First, transfer playback to our device
  makeSpotifyRequest('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      device_ids: [deviceId], 
      play: false 
    })
  }).then(() => {
    // Then start playing the playlist
    return makeSpotifyRequest(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        context_uri: `spotify:playlist:${playlistId}` 
      })
    });
  }).then(response => {
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    console.log('Playlist loaded successfully');
    updateStatus('Playlist loaded successfully!');
    document.getElementById('player-title').textContent = 'Loading playlist...';
  }).catch(error => {
    console.error('Error loading playlist:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to load playlist. Please check the URL.', true);
    }
  }).finally(() => {
    showLoading(false);
  });
}

// Song Search Functions
async function searchSongs(query) {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    showSearchLoading(true);
    updateStatus('Searching for songs...');
    
    // Clear previous results
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('similar-songs').innerHTML = '';

    const response = await makeSpotifyRequest(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=15`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    displaySearchResults(data.tracks.items);
    showSearchResults(true); // Show search results with similar songs
    updateStatus(`Found ${data.tracks.items.length} songs`);

  } catch (error) {
    console.error('Error searching songs:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to search songs. Please try again.', true);
    }
  } finally {
    showSearchLoading(false);
  }
}

async function getSimilarSongs(trackId) {
  if (!accessToken) {
    updateStatus('Please login to Spotify first', true);
    return;
  }

  try {
    updateStatus('Finding similar songs...');

    // Get track audio features first
    const featuresResponse = await makeSpotifyRequest(`https://api.spotify.com/v1/audio-features/${trackId}`);

    if (!featuresResponse.ok) {
      throw new Error(`HTTP ${featuresResponse.status}: ${featuresResponse.statusText}`);
    }

    const features = await featuresResponse.json();

    // Get recommendations based on the track
    const recommendationsResponse = await makeSpotifyRequest(
      `https://api.spotify.com/v1/recommendations?seed_tracks=${trackId}&limit=10&target_danceability=${features.danceability}&target_energy=${features.energy}&target_valence=${features.valence}`
    );

    if (!recommendationsResponse.ok) {
      throw new Error(`HTTP ${recommendationsResponse.status}: ${recommendationsResponse.statusText}`);
    }

    const recommendations = await recommendationsResponse.json();
    displaySimilarSongs(recommendations.tracks);
    showSearchResults(true); // Show search results with similar songs
    updateStatus(`Found ${recommendations.tracks.length} similar songs`);

  } catch (error) {
    console.error('Error getting similar songs:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to get similar songs. Please try again.', true);
    }
  }
}

async function playSong(trackUri) {
  if (!deviceId) {
    updateStatus('Please wait for the player to be ready, then try again.', true);
    return;
  }

  try {
    updateStatus('Playing song...');

    const response = await makeSpotifyRequest(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uris: [trackUri]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    updateStatus('Song started playing!');
    
    // Hide search results and return to player view
    setTimeout(() => {
      showSearchResults(false);
      updateStatus('Now playing - enjoy your music!');
    }, 1000);

  } catch (error) {
    console.error('Error playing song:', error);
    if (error.message === 'Authentication expired') {
      updateStatus('Session expired. Please login again.', true);
    } else {
      updateStatus('Failed to play song. Please try again.', true);
    }
  }
}

function displaySearchResults(tracks) {
  const resultsContainer = document.getElementById('search-results');
  
  if (!tracks || tracks.length === 0) {
    resultsContainer.innerHTML = '<div class="no-results">No songs found. Try a different search term.</div>';
    resultsContainer.style.display = 'block';
    return;
  }

  const resultsHTML = tracks.map(track => `
    <div class="search-result-item">
      <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/50x50?text=No+Image'}" alt="${track.name}">
      <div class="search-result-info">
        <div class="search-result-title">${track.name}</div>
        <div class="search-result-artist">${track.artists.map(artist => artist.name).join(', ')}</div>
      </div>
      <button class="search-result-play" onclick="playSong('${track.uri}')" title="Play">▶️</button>
      <button class="search-result-similar" onclick="getSimilarSongs('${track.id}')" title="Find Similar">🎵</button>
    </div>
  `).join('');

  resultsContainer.innerHTML = resultsHTML;
  resultsContainer.style.display = 'block';
  resultsContainer.style.overflowY = 'auto';
  
  console.log(`Displayed ${tracks.length} search results`);
}

function displaySimilarSongs(tracks) {
  const similarContainer = document.getElementById('similar-songs');
  
  if (!tracks || tracks.length === 0) {
    similarContainer.innerHTML = '<div class="no-results">No similar songs found.</div>';
    similarContainer.style.display = 'block';
    return;
  }

  const similarHTML = `
    <h4>🎵 Similar Songs You Might Like</h4>
    ${tracks.map(track => `
      <div class="similar-song-item">
        <img src="${track.album.images[0]?.url || 'https://via.placeholder.com/40x40?text=No+Image'}" alt="${track.name}">
        <div class="similar-song-info">
          <div class="similar-song-title">${track.name}</div>
          <div class="similar-song-artist">${track.artists.map(artist => artist.name).join(', ')}</div>
        </div>
        <button class="similar-song-play" onclick="playSong('${track.uri}')" title="Play">▶️</button>
      </div>
    `).join('')}
  `;

  similarContainer.innerHTML = similarHTML;
  similarContainer.style.display = 'block';
  similarContainer.style.overflowY = 'auto';
  
  console.log(`Displayed ${tracks.length} similar songs`);
}

function showSearchLoading(show) {
  const button = document.getElementById('song-search-btn');
  const indicator = document.getElementById('search-loading-indicator');
  
  if (show) {
    button.disabled = true;
    button.textContent = '';
    indicator.style.display = 'block';
  } else {
    button.disabled = false;
    button.textContent = 'Search';
    indicator.style.display = 'none';
  }
}

function showSearchResults(show) {
  const searchResults = document.getElementById('search-results');
  const similarSongs = document.getElementById('similar-songs');
  const returnBtn = document.getElementById('return-to-player-btn');
  
  if (show) {
    searchResults.style.display = 'block';
    similarSongs.style.display = 'block';
    returnBtn.style.display = 'block';
    
    // Ensure containers are scrollable
    searchResults.style.overflowY = 'auto';
    similarSongs.style.overflowY = 'auto';
  } else {
    searchResults.style.display = 'none';
    similarSongs.style.display = 'none';
    returnBtn.style.display = 'none';
    // Clear the results
    searchResults.innerHTML = '';
    similarSongs.innerHTML = '';
  }
}

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

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  const params = getHashParams();
  const queryParams = getQueryParams();
  
  // Debug: Log the URL parameters
  console.log('URL hash params:', params);
  console.log('URL query params:', queryParams);
  console.log('Current URL:', window.location.href);
  
  // Check for saved token first
  const savedToken = getSavedSpotifyToken();
  if (savedToken) {
    // Check if the saved token is still valid
    const isValid = await checkTokenValidity(savedToken);
    if (isValid) {
      accessToken = savedToken;
      document.getElementById('login-btn').hidden = true;
      updateStatus('Welcome back! You can now search for songs and discover similar music.');
      setupPlayer();
    } else {
      // Token is expired, clear it and show login button
      clearSpotifyToken();
      updateStatus('Session expired. Please login again.');
      document.getElementById('login-btn').onclick = loginWithSpotify;
    }
  } else if (params.access_token) {
    // Handle legacy implicit flow (if somehow still working)
    accessToken = params.access_token;
    console.log('Access token received (implicit flow), length:', accessToken.length);
    document.getElementById('login-btn').hidden = true;
    updateStatus('Authentication successful! You can now search for songs and discover similar music.');
    setupPlayer();
    saveSpotifyToken(accessToken);
  } else if (queryParams.code) {
    // Handle authorization code flow (modern approach)
    try {
      console.log('Authorization code received, exchanging for token...');
      updateStatus('Authorization code received, exchanging for token...');
      
      const token = await exchangeCodeForToken(queryParams.code);
      console.log('Token exchange successful, length:', token.length);
      
      document.getElementById('login-btn').hidden = true;
      updateStatus('Authentication successful! You can now search for songs and discover similar music.');
      setupPlayer();
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      saveSpotifyToken(token);
      
    } catch (error) {
      console.error('Token exchange failed:', error);
      updateStatus('Authentication failed. Please try again.', true);
      document.getElementById('login-btn').hidden = false;
      document.getElementById('login-btn').onclick = loginWithSpotify;
    }
  } else if (params.error || queryParams.error) {
    // Handle authentication errors
    const error = params.error || queryParams.error;
    console.error('Spotify auth error:', error);
    let errorMessage = 'Authentication failed';
    let showRetryButton = false;
    
    switch (error) {
      case 'access_denied':
        errorMessage = 'Access denied. Please allow the app to access your Spotify account.';
        showRetryButton = true;
        break;
      case 'invalid_client':
        errorMessage = 'Invalid client configuration. Please check your app settings.';
        break;
      case 'invalid_request':
        errorMessage = 'Invalid request. Please try again.';
        showRetryButton = true;
        break;
      case 'server_error':
        errorMessage = 'Spotify server error. Please try again later.';
        showRetryButton = true;
        break;
      case 'temporarily_unavailable':
        errorMessage = 'Spotify service temporarily unavailable. Please try again later.';
        showRetryButton = true;
        break;
      case 'unsupported_response_type':
        errorMessage = 'Using modern Authorization Code flow with PKCE. Please try again.';
        showRetryButton = true;
        break;
      default:
        errorMessage = `Authentication error: ${error}`;
        showRetryButton = true;
    }
    
    updateStatus(errorMessage, true);
    
    if (showRetryButton) {
      document.getElementById('login-btn').hidden = false;
      document.getElementById('login-btn').textContent = 'Try Again';
      document.getElementById('login-btn').onclick = loginWithSpotify;
    } else {
      document.getElementById('login-btn').hidden = false;
      document.getElementById('login-btn').onclick = loginWithSpotify;
    }
  } else {
    // No token or code, show login button
    updateStatus('Please login to Spotify to search for songs and discover similar music');
    document.getElementById('login-btn').onclick = loginWithSpotify;
  }
  
  // Player control event listeners
  document.getElementById('play-btn').onclick = () => {
    if (!player) {
      alert('Please login to Spotify first');
      return;
    }
    player.togglePlay();
  };
  
  document.getElementById('prev-btn').onclick = () => {
    if (!player) {
      alert('Please login to Spotify first');
      return;
    }
    player.previousTrack();
  };
  
  document.getElementById('next-btn').onclick = () => {
    if (!player) {
      alert('Please login to Spotify first');
      return;
    }
    player.nextTrack();
  };
  
  document.getElementById('seek-bar').oninput = (e) => {
    if (!player) return;
    
    // Pause the timer while user is dragging
    stopSeekBarTimer();
    
    const newPosition = Number(e.target.value);
    player.seek(newPosition);
    
    // Update the current time display immediately
    document.getElementById('current-time').textContent = msToTime(newPosition);
  };
  
  // Resume timer when user finishes dragging
  document.getElementById('seek-bar').onchange = () => {
    if (player) {
      // Small delay to ensure seek operation completes
      setTimeout(() => {
        player.getCurrentState().then(state => {
          if (state && !state.paused) {
            startSeekBarTimer();
          }
        });
      }, 100);
    }
  };
  
  // Song search functionality
  document.getElementById('song-search-btn').onclick = () => {
    const query = document.getElementById('song-search-input').value.trim();
    if (!query) {
      alert('Please enter a search term');
      return;
    }
    
    if (!accessToken) {
      alert('Please login to Spotify first');
      return;
    }
    
    searchSongs(query);
  };
  
  // Allow Enter key to submit song search
  document.getElementById('song-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('song-search-btn').click();
    }
  });
  
  // Return to player button
  document.getElementById('return-to-player-btn').onclick = () => {
    showSearchResults(false);
    updateStatus('Welcome back! You can now search for songs and discover similar music.');
  };
  
  // Initialize histogram bars
  createGlossyEqBars();
  
  // Test auth button
  document.getElementById('test-auth-btn').onclick = async () => {
    // Initialize PKCE values for testing
    codeVerifier = generateCodeVerifier(128);
    codeChallenge = await generateCodeChallenge(codeVerifier);
    testSpotifyAuth();
  };
  
  // Cleanup timer when page is unloaded
  window.addEventListener('beforeunload', () => {
    stopSeekBarTimer();
  });
  
  // Add logout button functionality
  if (!document.getElementById('logout-btn')) {
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logout-btn';
    logoutBtn.textContent = 'Logout from Spotify';
    logoutBtn.style.marginTop = '10px';
    logoutBtn.style.background = '#888';
    logoutBtn.style.color = '#fff';
    logoutBtn.style.border = 'none';
    logoutBtn.style.borderRadius = '20px';
    logoutBtn.style.padding = '10px 20px';
    logoutBtn.style.cursor = 'pointer';
    logoutBtn.style.fontSize = '14px';
    document.querySelector('.player-info').appendChild(logoutBtn);
    logoutBtn.onclick = () => {
      clearSpotifyToken();
      accessToken = null;
      updateStatus('Logged out. Please login to Spotify to search for songs and discover similar music');
      document.getElementById('login-btn').hidden = false;
      if (player && player.disconnect) player.disconnect();
    };
  }
}); 