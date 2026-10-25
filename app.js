// ==========================================================================
// ReelStream - Single View & Unified Live Watch Together (Finger Swipe Enabled)
// ==========================================================================

let allUrls = [];
const history = [];
let historyPointer = -1;
let nextPreloadedReel = null;
let isMuted = true;

// Local storage
const STORAGE_LIKES = 'reelstream_likes';
const STORAGE_COMMENTS = 'reelstream_comments';
const myLikedIds = new Set(JSON.parse(localStorage.getItem(STORAGE_LIKES) || '[]'));
const localComments = JSON.parse(localStorage.getItem(STORAGE_COMMENTS) || '{}');

// Live Room State
let socket = null;
let isWatchTogether = false;
let onlineCount = 1;
let liveComments = [];
let liveReelLikes = {}; // str(reel_id) -> real count

// DOM Elements
const playerStage = document.getElementById('playerStage');
const activeVideo = document.getElementById('activeVideo');
const preloadVideo = document.getElementById('preloadVideo');
const stageSpinner = document.getElementById('stageSpinner');
const centerIndicator = document.getElementById('centerIndicator');
const heartBurst = document.getElementById('heartBurst');
const btnAudioToggle = document.getElementById('btnAudioToggle');
const audioIcon = document.getElementById('audioIcon');
const btnModeToggle = document.getElementById('btnModeToggle');
const statusDot = document.getElementById('statusDot');
const modeLabel = document.getElementById('modeLabel');

const btnLove = document.getElementById('btnLove');
const loveIcon = document.getElementById('loveIcon');
const loveCount = document.getElementById('loveCount');
const btnComment = document.getElementById('btnComment');
const commentsCount = document.getElementById('commentsCount');
const scrubberBar = document.getElementById('scrubberBar');
const scrubberFill = document.getElementById('scrubberFill');

const msgPopup = document.getElementById('msgPopup');
const msgPopupSender = document.getElementById('msgPopupSender');
const msgPopupText = document.getElementById('msgPopupText');

const commentsOverlay = document.getElementById('commentsOverlay');
const btnCloseComments = document.getElementById('btnCloseComments');
const commentsList = document.getElementById('commentsList');
const customInputText = document.getElementById('customInputText');
const customInputPlaceholder = document.getElementById('customInputPlaceholder');
const btnInputClear = document.getElementById('btnInputClear');
const btnSubmitComment = document.getElementById('btnSubmitComment');
const builtInKeyboard = document.getElementById('builtInKeyboard');
const kbBtnShift = document.getElementById('kbBtnShift');
const kbBtnBackspace = document.getElementById('kbBtnBackspace');
const kbBtnSpace = document.getElementById('kbBtnSpace');
const kbBtnClear = document.getElementById('kbBtnClear');
const kbBtnSend = document.getElementById('kbBtnSend');
const commentsSubtitle = document.getElementById('commentsSubtitle');
const toastPopup = document.getElementById('toastPopup');

// Toast Notification
function showToast(msg) {
  toastPopup.textContent = msg;
  toastPopup.classList.add('show');
  setTimeout(() => {
    toastPopup.classList.remove('show');
  }, 2200);
}

// Show Actual Incoming Message
let msgPopupTimer = null;
function showIncomingMessage(sender, text) {
  if (!msgPopup) return;
  msgPopupSender.textContent = sender || 'Partner';
  msgPopupText.textContent = text;
  msgPopup.classList.add('visible');

  if (msgPopupTimer) clearTimeout(msgPopupTimer);
  msgPopupTimer = setTimeout(() => {
    msgPopup.classList.remove('visible');
  }, 4500);
}

if (msgPopup) {
  msgPopup.addEventListener('click', () => {
    msgPopup.classList.remove('visible');
    openComments();
  });
}

// Random Reel Picker (Pure URL, Zero Fake Reacts)
function pickRandomReel() {
  if (allUrls.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * allUrls.length);
  return {
    id: randomIndex + 1,
    url: allUrls[randomIndex]
  };
}

// Background Preload
function prepareNextPreload() {
  nextPreloadedReel = pickRandomReel();
  if (nextPreloadedReel) {
    preloadVideo.src = nextPreloadedReel.url;
    preloadVideo.load();
  }
}

// Play Reel on Stage
let animTimeout = null;
function playReel(reel, notifyServer = true, direction = null) {
  if (!reel) return;

  // Simple, sleek transition animation on reel changes
  if (direction === 'next' || direction === 'prev') {
    activeVideo.classList.remove('anim-slide-next', 'anim-slide-prev');
    void activeVideo.offsetWidth; // Force reflow
    activeVideo.classList.add(direction === 'next' ? 'anim-slide-next' : 'anim-slide-prev');

    if (animTimeout) clearTimeout(animTimeout);
    animTimeout = setTimeout(() => {
      activeVideo.classList.remove('anim-slide-next', 'anim-slide-prev');
    }, 320);
  }

  activeVideo.src = reel.url;
  activeVideo.muted = isMuted;

  activeVideo.play().then(() => {
    stageSpinner.style.opacity = '0';
  }).catch(() => {
    stageSpinner.style.opacity = '0';
  });

  centerIndicator.classList.remove('active');
  updateSideRailUI(reel);

  if (isWatchTogether && notifyServer && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'change_reel',
      reel: reel
    }));
  }
}

// Update Side Rail Controls
function updateSideRailUI(reel) {
  const isLovedByMe = myLikedIds.has(reel.id);

  if (isLovedByMe) {
    btnLove.classList.add('loved');
    loveIcon.setAttribute('fill', 'currentColor');
  } else {
    btnLove.classList.remove('loved');
    loveIcon.setAttribute('fill', 'none');
  }

  let count = 0;
  if (isWatchTogether) {
    count = liveReelLikes[reel.id] || (isLovedByMe ? 1 : 0);
  } else {
    count = isLovedByMe ? 1 : 0;
  }
  loveCount.textContent = count;

  const cCount = isWatchTogether ? liveComments.length : (localComments[reel.id] || []).length;
  commentsCount.textContent = cCount;
}

// Navigate Next (Random + Preloaded)
function goNext() {
  if (historyPointer < history.length - 1) {
    historyPointer++;
    const reel = history[historyPointer];
    playReel(reel, true, 'next');
  } else {
    const reel = nextPreloadedReel || pickRandomReel();
    history.push(reel);
    historyPointer = history.length - 1;
    playReel(reel, true, 'next');
    prepareNextPreload();
  }
}

// Navigate Previous
function goPrevious() {
  if (historyPointer > 0) {
    historyPointer--;
    const reel = history[historyPointer];
    playReel(reel, true, 'prev');
  } else {
    showToast('First reel in session');
  }
}

// Love React Toggle (Real Reactions Only)
function toggleLove(fromPartner = false) {
  if (historyPointer < 0 || !history[historyPointer]) return;
  const currentReel = history[historyPointer];
  const isLoved = myLikedIds.has(currentReel.id);

  if (fromPartner) {
    heartBurst.classList.remove('animate');
    void heartBurst.offsetWidth;
    heartBurst.classList.add('animate');
    updateSideRailUI(currentReel);
    return;
  }

  let delta = 1;
  if (isLoved) {
    myLikedIds.delete(currentReel.id);
    delta = -1;
  } else {
    myLikedIds.add(currentReel.id);
    delta = 1;
    heartBurst.classList.remove('animate');
    void heartBurst.offsetWidth;
    heartBurst.classList.add('animate');
  }

  localStorage.setItem(STORAGE_LIKES, JSON.stringify([...myLikedIds]));

  if (isWatchTogether) {
    const prev = liveReelLikes[currentReel.id] || 0;
    liveReelLikes[currentReel.id] = Math.max(0, prev + delta);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'love_react',
        reel_id: currentReel.id,
        delta: delta
      }));
    }
  }

  updateSideRailUI(currentReel);
}

// Single / Double Tap Handling
let lastTap = 0;
activeVideo.addEventListener('click', () => {
  const now = Date.now();
  if (now - lastTap < 300) {
    toggleLove(false);
    lastTap = 0;
  } else {
    lastTap = now;
    setTimeout(() => {
      if (lastTap === now) {
        if (activeVideo.paused) {
          activeVideo.play();
          centerIndicator.classList.remove('active');
          syncPlayPause(false);
        } else {
          activeVideo.pause();
          centerIndicator.classList.add('active');
          syncPlayPause(true);
        }
      }
    }, 305);
  }
});

function syncPlayPause(isPaused) {
  if (isWatchTogether && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'play_pause',
      is_paused: isPaused
    }));
  }
}

// Button Clicks
btnLove.addEventListener('click', () => toggleLove(false));

// ==========================================================================
// Finger Swipe Detection (Smooth Mobile & Touch Gestures)
// ==========================================================================
let touchStartY = 0;
let touchStartX = 0;
let touchStartTime = 0;

playerStage.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchStartTime = Date.now();
}, { passive: true });

playerStage.addEventListener('touchend', (e) => {
  const deltaY = e.changedTouches[0].clientY - touchStartY;
  const deltaX = e.changedTouches[0].clientX - touchStartX;
  const timeDiff = Date.now() - touchStartTime;

  // Vertical swipe threshold (min 40px and predominantly vertical)
  if (Math.abs(deltaY) > 40 && Math.abs(deltaY) > Math.abs(deltaX) && timeDiff < 650) {
    if (deltaY < 0) {
      // Swipe Up -> Next Reel
      goNext();
    } else {
      // Swipe Down -> Previous Reel
      goPrevious();
    }
  }
}, { passive: true });

// Mouse Wheel Navigation with Throttle
let wheelThrottle = false;
window.addEventListener('wheel', (e) => {
  if (wheelThrottle || commentsOverlay.classList.contains('open')) return;
  if (Math.abs(e.deltaY) > 25) {
    wheelThrottle = true;
    if (e.deltaY > 0) goNext();
    else goPrevious();
    setTimeout(() => { wheelThrottle = false; }, 380);
  }
}, { passive: true });

// Video Buffering & Scrubbing
activeVideo.addEventListener('waiting', () => { stageSpinner.style.opacity = '1'; });
activeVideo.addEventListener('canplay', () => { stageSpinner.style.opacity = '0'; });
activeVideo.addEventListener('playing', () => { stageSpinner.style.opacity = '0'; });

activeVideo.addEventListener('timeupdate', () => {
  if (activeVideo.duration) {
    const pct = (activeVideo.currentTime / activeVideo.duration) * 100;
    scrubberFill.style.width = `${pct}%`;
  }
});

scrubberBar.addEventListener('click', (e) => {
  e.stopPropagation();
  const rect = scrubberBar.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  if (activeVideo.duration) {
    activeVideo.currentTime = pos * activeVideo.duration;
    if (isWatchTogether && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'seek',
        time: activeVideo.currentTime
      }));
    }
  }
});

// Audio Toggle
btnAudioToggle.addEventListener('click', () => {
  isMuted = !isMuted;
  activeVideo.muted = isMuted;

  if (isMuted) {
    audioIcon.innerHTML = `
      <line x1="1" y1="1" x2="23" y2="23"></line>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    `;
    showToast('Muted');
  } else {
    audioIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
    showToast('Unmuted');
  }
});

// ==========================================================================
// Comments Drawer (Live Synced in Watch Together)
// ==========================================================================
function openComments() {
  commentsOverlay.classList.add('open');
  renderComments();
}

function closeComments() {
  commentsOverlay.classList.remove('open');
}

btnComment.addEventListener('click', openComments);
btnCloseComments.addEventListener('click', closeComments);
commentsOverlay.addEventListener('click', (e) => {
  if (e.target === commentsOverlay) closeComments();
});

function renderComments() {
  commentsList.innerHTML = '';
  const currentReel = history[historyPointer];
  if (!currentReel) return;

  const comments = isWatchTogether ? liveComments : (localComments[currentReel.id] || []);

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <div class="empty-comments">
        ${isWatchTogether ? 'No live comments yet.<br>Chat with others watching live.' : 'No comments yet.<br>Write a comment below.'}
      </div>`;
    return;
  }

  comments.forEach(c => {
    const isPartner = c.sender === 'Partner';
    const bubble = document.createElement('div');
    bubble.className = `comment-bubble ${isPartner ? 'partner' : ''}`;
    bubble.innerHTML = `
      <div class="comment-author-tag">${escapeHtml(c.sender || 'You')}</div>
      <div class="comment-content">${escapeHtml(c.text)}</div>
      <div class="comment-stamp">${c.time}</div>
    `;
    commentsList.appendChild(bubble);
  });
}

let currentComment = '';
let isShiftActive = false;

function updateCommentDisplay() {
  if (customInputText) {
    customInputText.textContent = currentComment;
  }
  if (customInputPlaceholder) {
    customInputPlaceholder.style.display = currentComment.length > 0 ? 'none' : 'inline';
  }
  if (btnInputClear) {
    btnInputClear.style.display = currentComment.length > 0 ? 'flex' : 'none';
  }
}

function appendCommentChar(char) {
  if (currentComment.length < 240) {
    currentComment += char;
    updateCommentDisplay();
  }
}

function deleteCommentChar() {
  if (currentComment.length > 0) {
    currentComment = currentComment.slice(0, -1);
    updateCommentDisplay();
  }
}

function clearCommentInput() {
  currentComment = '';
  updateCommentDisplay();
}

function toggleShift() {
  isShiftActive = !isShiftActive;
  if (kbBtnShift) {
    kbBtnShift.classList.toggle('active', isShiftActive);
  }
  document.querySelectorAll('.kb-letter').forEach(btn => {
    const ch = btn.getAttribute('data-char');
    if (ch) {
      btn.textContent = isShiftActive ? ch.toUpperCase() : ch.toLowerCase();
    }
  });
}

function submitComment() {
  const text = currentComment.trim();
  if (!text || historyPointer < 0) return;

  const currentReel = history[historyPointer];
  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const commentObj = {
    sender: 'You',
    text: text,
    time: timeStr
  };

  if (isWatchTogether) {
    liveComments.unshift(commentObj);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'comment',
        comment: commentObj
      }));
    }
  } else {
    if (!localComments[currentReel.id]) localComments[currentReel.id] = [];
    localComments[currentReel.id].unshift(commentObj);
    localStorage.setItem(STORAGE_COMMENTS, JSON.stringify(localComments));
  }

  clearCommentInput();
  renderComments();
  updateSideRailUI(currentReel);
  commentsList.scrollTop = 0;
}

// Built-in Keyboard Event Handling (On-screen taps)
if (builtInKeyboard) {
  builtInKeyboard.addEventListener('click', (e) => {
    const btn = e.target.closest('.kb-key');
    if (!btn) return;

    const char = btn.getAttribute('data-char');
    if (char) {
      const finalChar = (btn.classList.contains('kb-letter') && isShiftActive) ? char.toUpperCase() : char;
      appendCommentChar(finalChar);
      return;
    }

    if (btn.id === 'kbBtnShift' || btn.closest('#kbBtnShift')) {
      toggleShift();
    } else if (btn.id === 'kbBtnBackspace' || btn.closest('#kbBtnBackspace')) {
      deleteCommentChar();
    } else if (btn.id === 'kbBtnSpace' || btn.closest('#kbBtnSpace')) {
      appendCommentChar(' ');
    } else if (btn.id === 'kbBtnClear' || btn.closest('#kbBtnClear')) {
      clearCommentInput();
    } else if (btn.id === 'kbBtnSend' || btn.closest('#kbBtnSend')) {
      submitComment();
    }
  });
}

if (btnSubmitComment) {
  btnSubmitComment.addEventListener('click', submitComment);
}

if (btnInputClear) {
  btnInputClear.addEventListener('click', clearCommentInput);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================================
// Unified Single Live Room
// ==========================================================================
function connectLiveRoom() {
  isWatchTogether = true;
  statusDot.className = 'status-dot waiting';
  modeLabel.textContent = 'Connecting...';
  commentsSubtitle.textContent = 'Connecting to room...';

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/live`;

  if (socket) {
    try { socket.close(); } catch (e) {}
  }

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    // If client is already watching a reel, share it with the room if we are sole viewer
    if (historyPointer >= 0 && history[historyPointer] && onlineCount <= 1) {
      socket.send(JSON.stringify({
        type: 'change_reel',
        reel: history[historyPointer]
      }));
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleLiveMessage(data);
    } catch (err) {
      console.error('Socket message parse error:', err);
    }
  };

  socket.onclose = () => {
    statusDot.className = 'status-dot';
    modeLabel.textContent = 'Reconnecting...';
    setTimeout(() => {
      connectLiveRoom();
    }, 2500);
  };
}

function handleLiveMessage(data) {
  switch (data.type) {
    case 'init_state':
      if (data.current_reel) {
        // If we haven't played anything or if there are 2+ viewers online, sync to room reel
        if (history.length === 0 || (data.online_count && data.online_count >= 2)) {
          history.push(data.current_reel);
          historyPointer = history.length - 1;
          playReel(data.current_reel, false);
        }
      }
      if (data.comments) {
        liveComments = data.comments;
        renderComments();
      }
      if (data.reel_likes) {
        liveReelLikes = data.reel_likes;
        if (history[historyPointer]) updateSideRailUI(history[historyPointer]);
      }
      updatePresence(data.online_count || 1);
      if (data.online_count >= 2) {
        showToast('Partner online! Watching together 🎬');
      }
      break;

    case 'presence_update':
      const prevCount = onlineCount;
      updatePresence(data.online_count);
      if (data.online_count >= 2 && prevCount < 2) {
        showToast('Partner joined! Watching together 🎬');
      } else if (data.online_count < 2 && prevCount >= 2) {
        showToast('Partner went offline');
      }
      break;

    case 'sync_reel':
      history.push(data.reel);
      historyPointer = history.length - 1;
      playReel(data.reel, false, 'next');
      prepareNextPreload();
      break;

    case 'sync_play_pause':
      if (data.is_paused) {
        activeVideo.pause();
        centerIndicator.classList.add('active');
      } else {
        activeVideo.play();
        centerIndicator.classList.remove('active');
      }
      break;

    case 'sync_seek':
      if (typeof data.time === 'number') {
        activeVideo.currentTime = data.time;
      }
      break;

    case 'sync_love':
      liveReelLikes[data.reel_id] = data.count;
      toggleLove(true);
      showToast('Partner loved this reel ❤️');
      break;

    case 'sync_comment':
      liveComments.unshift({
        sender: 'Partner',
        text: data.comment.text,
        time: data.comment.time
      });
      renderComments();
      updateSideRailUI(history[historyPointer]);
      
      // Instead of generic "new message incoming", display the ACTUAL message text!
      if (!commentsOverlay.classList.contains('open')) {
        showIncomingMessage('Partner', data.comment.text);
      }
      break;
  }
}

function updatePresence(count) {
  onlineCount = count;
  if (count >= 2) {
    btnModeToggle.classList.add('active-live');
    statusDot.className = 'status-dot connected';
    modeLabel.textContent = `Watch Together (${count}) 🟢`;
    commentsSubtitle.textContent = `Live synchronized with ${count} viewers`;
  } else {
    btnModeToggle.classList.remove('active-live');
    statusDot.className = 'status-dot waiting';
    modeLabel.textContent = '1 Online';
    commentsSubtitle.textContent = 'Live Room — Waiting for partner';
  }
}

// Mode Button shows live connection status
btnModeToggle.addEventListener('click', () => {
  if (onlineCount >= 2) {
    showToast(`Watching together live (${onlineCount} online) 🟢`);
  } else {
    showToast('Auto-connected: Waiting for partner to join... ⏳');
  }
});

// Keyboard Navigation & Typing
window.addEventListener('keydown', (e) => {
  // If comments drawer is open, handle typing through custom input
  if (commentsOverlay.classList.contains('open')) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      deleteCommentChar();
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitComment();
      return;
    } else if (e.key === 'Escape') {
      closeComments();
      return;
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      appendCommentChar(e.key);
      return;
    }
    return;
  }

  const key = e.key.toLowerCase();
  if (e.key === 'ArrowDown' || key === 'j') {
    e.preventDefault();
    goNext();
  } else if (e.key === 'ArrowUp' || key === 'k') {
    e.preventDefault();
    goPrevious();
  } else if (e.key === ' ') {
    e.preventDefault();
    if (activeVideo.paused) {
      activeVideo.play();
      centerIndicator.classList.remove('active');
      syncPlayPause(false);
    } else {
      activeVideo.pause();
      centerIndicator.classList.add('active');
      syncPlayPause(true);
    }
  } else if (key === 'm') {
    btnAudioToggle.click();
  } else if (key === 'l') {
    toggleLove(false);
  } else if (key === 'c') {
    if (commentsOverlay.classList.contains('open')) closeComments();
    else openComments();
  } else if (e.key === 'Escape') {
    closeComments();
  }
});

// Telegram Web App Verification (Direct browser access blocked)
async function verifyTelegramWebApp() {
  const tg = window.Telegram?.WebApp;
  const initData = tg?.initData;

  // Check if opened directly in a browser
  if (!initData) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      document.getElementById('telegramGate').style.display = 'none';
      document.getElementById('playerApp').style.display = 'flex';
      return true;
    }
    // Block direct access in browser
    document.getElementById('telegramGate').style.display = 'flex';
    document.getElementById('playerApp').style.display = 'none';
    return false;
  }

  // Validate cryptographic HMAC signature with backend
  try {
    const res = await fetch('/api/validate_twa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ init_data: initData })
    });
    const result = await res.json();
    if (result.valid) {
      if (tg.ready) tg.ready();
      if (tg.expand) tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#000000');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#000000');
      document.title = 'Reels';
      document.getElementById('telegramGate').style.display = 'none';
      document.getElementById('playerApp').style.display = 'flex';
      return true;
    }
  } catch (err) {
    console.error('Telegram validation error:', err);
  }

  // If signature invalid or tampered
  document.getElementById('telegramGate').style.display = 'flex';
  document.getElementById('playerApp').style.display = 'none';
  return false;
}

// Initialize Application
async function init() {
  const isAllowed = await verifyTelegramWebApp();
  if (!isAllowed) {
    return; // Block direct access
  }

  try {
    const res = await fetch('reels.json');
    allUrls = await res.json();

    // Start playback with a random reel immediately
    const firstReel = pickRandomReel();
    if (firstReel) {
      history.push(firstReel);
      historyPointer = 0;
      playReel(firstReel, false);
    }
    prepareNextPreload();

    // Automatically connect to live room immediately!
    // If 2 users are online, they connect together automatically without clicking anything!
    connectLiveRoom();
  } catch (err) {
    console.error('Failed to load reels.json:', err);
  }
}

init();
