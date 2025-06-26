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
];
let player, deviceId, accessToken;

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
  if (accessToken) {
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

function updatePlayerUI(state) {
  if (!state) return;
  
  const track = state.track_window.current_track;
  const artists = track.artists.map(a => a.name).join(', ');
  
  document.getElementById('player-title').textContent = `${track.name} - ${artists}`;
  document.getElementById('player-artwork').src = track.album.images[0]?.url || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=400&q=80';
  document.getElementById('current-time').textContent = msToTime(state.position);
  document.getElementById('duration').textContent = msToTime(state.duration);
  document.getElementById('seek-bar').max = state.duration;
  document.getElementById('seek-bar').value = state.position;
  document.getElementById('play-btn').textContent = state.paused ? '▶️' : '⏸️';
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
  
  updateStatus('Connecting to Spotify...');
  
  // Check if SDK is already loaded
  if (typeof Spotify === 'undefined') {
    console.error('Spotify Web Playback SDK not loaded');
    updateStatus('Spotify SDK not loaded. Please refresh the page.', true);
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
    fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: { 
        'Authorization': 'Bearer ' + accessToken, 
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
  });
  
  player.addListener('initialization_error', ({ message }) => {
    console.error('Failed to initialize player:', message);
    updateStatus('Failed to initialize player', true);
  });
  
  player.addListener('authentication_error', ({ message }) => {
    console.error('Failed to authenticate:', message);
    updateStatus('Authentication failed. Please login again.', true);
    // Re-login if authentication fails
    setTimeout(() => loginWithSpotify(), 2000);
  });
  
  player.addListener('account_error', ({ message }) => {
    console.error('Failed to validate Spotify account:', message);
    updateStatus('Account error. Please check your Spotify Premium status.', true);
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
    }
  });
  
  player.connect().then(success => {
    if (success) {
      console.log('Successfully connected to Spotify!');
    } else {
      updateStatus('Failed to connect to Spotify', true);
    }
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
  fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: { 
      'Authorization': 'Bearer ' + accessToken, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ 
      device_ids: [deviceId], 
      play: false 
    })
  }).then(() => {
    // Then start playing the playlist
    return fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      headers: { 
        'Authorization': 'Bearer ' + accessToken, 
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
    updateStatus('Failed to load playlist. Please check the URL.', true);
  }).finally(() => {
    showLoading(false);
  });
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
  
  if (params.access_token) {
    // Handle legacy implicit flow (if somehow still working)
    accessToken = params.access_token;
    console.log('Access token received (implicit flow), length:', accessToken.length);
    document.getElementById('login-btn').hidden = true;
    updateStatus('Authentication successful! Setting up player...');
    setupPlayer();
  } else if (queryParams.code) {
    // Handle authorization code flow (modern approach)
    try {
      console.log('Authorization code received, exchanging for token...');
      updateStatus('Authorization code received, exchanging for token...');
      
      const token = await exchangeCodeForToken(queryParams.code);
      console.log('Token exchange successful, length:', token.length);
      
      document.getElementById('login-btn').hidden = true;
      updateStatus('Authentication successful! Setting up player...');
      setupPlayer();
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
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
    updateStatus('Please login to Spotify to start playing music');
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
    player.seek(Number(e.target.value));
  };
  
  // Playlist loading
  document.getElementById('spotify-url-btn').onclick = () => {
    const url = document.getElementById('spotify-url-input').value.trim();
    if (!url) {
      alert('Please enter a Spotify playlist URL');
      return;
    }
    
    const playlistId = extractSpotifyPlaylistId(url);
    if (!playlistId) {
      alert('Please enter a valid Spotify playlist URL, URI, or ID.');
      return;
    }
    
    if (!deviceId) {
      alert('Please wait for the player to be ready, then try again.');
      return;
    }
    
    loadPlaylist(playlistId);
  };
  
  // Allow Enter key to submit playlist URL
  document.getElementById('spotify-url-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      document.getElementById('spotify-url-btn').click();
    }
  });
  
  // Test auth button
  document.getElementById('test-auth-btn').onclick = async () => {
    // Initialize PKCE values for testing
    codeVerifier = generateCodeVerifier(128);
    codeChallenge = await generateCodeChallenge(codeVerifier);
    testSpotifyAuth();
  };
}); 