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
// IMPORTANT: Replace this with your NEW Spotify app Client ID
// Get it from: https://developer.spotify.com/dashboard
// Create a new app with these settings:
// - App name: "My Tool Engine Player"
// - Redirect URI: "https://mytoolengine.netlify.app/"
// - App type: "Web App"
const clientId = 'fd061c95ff4342eda082dd1f8a3eeaec'; // Your new Spotify Client ID (Web App)
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

function loginWithSpotify() {
  // Clear any existing errors
  updateStatus('Redirecting to Spotify...');
  
  // Use implicit flow (token response type)
  const responseType = 'token'; // Use token for implicit flow
  const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join('%20')}&response_type=${responseType}&show_dialog=true`;
  
  console.log('Redirecting to Spotify with URL:', url);
  
  try {
    window.location = url;
  } catch (error) {
    console.error('Error redirecting to Spotify:', error);
    updateStatus('Failed to redirect to Spotify. Please try again.', true);
  }
}

function loginWithSpotifyAlternative() {
  // Alternative login method with different parameters
  updateStatus('Trying alternative login method...');
  
  const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes.join('%20')}&response_type=token&state=123&show_dialog=true`;
  
  console.log('Alternative login URL:', url);
  
  try {
    window.location = url;
  } catch (error) {
    console.error('Error with alternative login:', error);
    updateStatus('Alternative login failed. Please check your Spotify app settings.', true);
  }
}

function loginWithSpotifyFallback() {
  // Fallback method using authorization code flow (requires backend)
  updateStatus('Trying fallback method...');
  
  // For now, show instructions to create a new app
  updateStatus('Please create a new Spotify app with Web App type. See instructions in console.', true);
  console.log(`
    ========================================
    SPOTIFY APP SETUP INSTRUCTIONS:
    ========================================
    1. Go to: https://developer.spotify.com/dashboard
    2. Click "Create App"
    3. Fill in:
       - App name: "My Tool Engine Player"
       - App description: "Web-based Spotify player"
       - Redirect URI: "https://mytoolengine.netlify.app/"
       - Website: "https://mytoolengine.netlify.app/"
       - App type: "Web App"
    4. Save the app
    5. Copy the new Client ID
    6. Replace 'YOUR_NEW_CLIENT_ID_HERE' in script.js
    7. Refresh the page and try again
    ========================================
  `);
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

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const params = getHashParams();
  
  // Debug: Log the URL parameters
  console.log('URL hash params:', params);
  console.log('Current URL:', window.location.href);
  
  if (params.access_token) {
    accessToken = params.access_token;
    console.log('Access token received, length:', accessToken.length);
    document.getElementById('login-btn').hidden = true;
    updateStatus('Authentication successful! Setting up player...');
    setupPlayer();
  } else if (params.error) {
    // Handle authentication errors
    console.error('Spotify auth error:', params.error);
    let errorMessage = 'Authentication failed';
    let showRetryButton = false;
    
    switch (params.error) {
      case 'access_denied':
        errorMessage = 'Access denied. Please allow the app to access your Spotify account.';
        showRetryButton = true;
        break;
      case 'invalid_client':
        errorMessage = 'Invalid client configuration. Please contact the developer.';
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
        errorMessage = 'Your Spotify app is configured for a different response type. Please create a new app with Web App type.';
        showRetryButton = true;
        break;
      default:
        errorMessage = `Authentication error: ${params.error}`;
        showRetryButton = true;
    }
    
    updateStatus(errorMessage, true);
    
    if (showRetryButton) {
      document.getElementById('login-btn').hidden = false;
      document.getElementById('login-btn').textContent = 'Try Again';
      document.getElementById('login-btn').onclick = () => {
        if (params.error === 'unsupported_response_type') {
          loginWithSpotifyFallback();
        } else {
          loginWithSpotify();
        }
      };
    } else {
      document.getElementById('login-btn').hidden = false;
      document.getElementById('login-btn').onclick = loginWithSpotify;
    }
  } else {
    // No token, show login button
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
}); 