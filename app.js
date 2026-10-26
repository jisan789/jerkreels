// ==========================================================================
// ReelStream - Ultra-Smooth Native Dual-Slot Video Player
// ==========================================================================

let allUrls = [];
const history = [];
let historyPointer = -1;
let nextPreloadedReel = null;
let isMuted = true;
let isTransitioning = false;

// Local storage for Likes and Comments
const STORAGE_LIKES = 'reelstream_likes';
const STORAGE_COMMENTS = 'reelstream_comments';
const myLikedIds = new Set(JSON.parse(localStorage.getItem(STORAGE_LIKES) || '[]'));
const localComments = JSON.parse(localStorage.getItem(STORAGE_COMMENTS) || '{}');

// DOM Elements
const playerStage = document.getElementById('playerStage');
const videoCarousel = document.getElementById('videoCarousel');
const slotA = document.getElementById('slotA');
const slotB = document.getElementById('slotB');
const videoA = document.getElementById('videoA');
const videoB = document.getElementById('videoB');

const stageSpinner = document.getElementById('stageSpinner');
const centerIndicator = document.getElementById('centerIndicator');
const heartBurst = document.getElementById('heartBurst');
const btnAudioToggle = document.getElementById('btnAudioToggle');
const audioIcon = document.getElementById('audioIcon');

const btnLove = document.getElementById('btnLove');
const loveIcon = document.getElementById('loveIcon');
const loveCount = document.getElementById('loveCount');
const btnComment = document.getElementById('btnComment');
const commentsCount = document.getElementById('commentsCount');
const btnSendInbox = document.getElementById('btnSendInbox');
const scrubberBar = document.getElementById('scrubberBar');
const scrubberFill = document.getElementById('scrubberFill');

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
const toastPopup = document.getElementById('toastPopup');

// Dual-Slot State: 0 -> slotA is active, 1 -> slotB is active
let activeSlotIndex = 0;

function getActiveSlot() {
  return activeSlotIndex === 0 ? slotA : slotB;
}

function getInactiveSlot() {
  return activeSlotIndex === 0 ? slotB : slotA;
}

function getActiveVideo() {
  return activeSlotIndex === 0 ? videoA : videoB;
}

function getInactiveVideo() {
  return activeSlotIndex === 0 ? videoB : videoA;
}

// Toast Notification
function showToast(msg) {
  toastPopup.textContent = msg;
  toastPopup.classList.add('show');
  setTimeout(() => {
    toastPopup.classList.remove('show');
  }, 2200);
}

// Random Reel Picker
function pickRandomReel() {
  if (allUrls.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * allUrls.length);
  return {
    id: randomIndex + 1,
    url: allUrls[randomIndex]
  };
}

// Background Preload into Inactive Slot
function prepareNextPreload() {
  nextPreloadedReel = pickRandomReel();
  if (nextPreloadedReel) {
    const inactiveVid = getInactiveVideo();
    if (inactiveVid.src !== nextPreloadedReel.url) {
      inactiveVid.src = nextPreloadedReel.url;
      inactiveVid.muted = true;
      inactiveVid.preload = 'auto';
      inactiveVid.load();
    }
  }
}

// Video Watchdog & Error Auto-Skip
let videoWatchdogTimer = null;
let isAutoSkipping = false;

function cancelWatchdog() {
  if (videoWatchdogTimer) {
    clearTimeout(videoWatchdogTimer);
    videoWatchdogTimer = null;
  }
}

function handleVideoPlaybackError(reason = 'error') {
  if (isAutoSkipping) return;
  isAutoSkipping = true;
  cancelWatchdog();
  stageSpinner.style.opacity = '1';

  console.warn(`Video playback issue (${reason}). Auto-skipping to next reel...`);
  showToast('Skipping unavailable reel... ⏭️');

  setTimeout(() => {
    isAutoSkipping = false;
    goNext();
  }, 350);
}

// Play / Transition Reel with Silky Native Dual-Slot Animation
function playReel(reel, direction = null) {
  if (!reel) {
    handleVideoPlaybackError('empty_reel');
    return;
  }

  cancelWatchdog();
  stageSpinner.style.opacity = '1';

  // Initial load without slide transition
  if (!direction) {
    const activeSlot = getActiveSlot();
    const activeVid = getActiveVideo();

    activeSlot.className = 'video-slot active-slot';
    activeSlot.style.transform = '';
    activeSlot.style.opacity = '1';
    activeSlot.style.filter = '';

    activeVid.src = reel.url;
    activeVid.muted = isMuted;

    activeVid.play().then(() => {
      cancelWatchdog();
      stageSpinner.style.opacity = '0';
    }).catch(() => {
      stageSpinner.style.opacity = '0';
    });

    centerIndicator.classList.remove('active');
    updateSideRailUI(reel);
    prepareNextPreload();
    return;
  }

  if (isTransitioning) return;
  isTransitioning = true;

  const currSlot = getActiveSlot();
  const incomingSlot = getInactiveSlot();
  const currVideo = getActiveVideo();
  const incomingVideo = getInactiveVideo();

  // Ensure target URL is assigned to incoming video
  if (incomingVideo.src !== reel.url) {
    incomingVideo.src = reel.url;
  }
  incomingVideo.muted = isMuted;
  incomingVideo.currentTime = 0;

  // Reset classes and inline styles before starting animation
  incomingSlot.classList.remove('is-animating', 'slide-in-center', 'slide-out-top', 'slide-out-bottom');
  currSlot.classList.remove('is-animating', 'slide-in-center', 'slide-out-top', 'slide-out-bottom');

  incomingSlot.style.transition = 'none';
  currSlot.style.transition = 'none';
  incomingSlot.style.opacity = '1';
  incomingSlot.style.filter = 'brightness(1)';
  currSlot.style.filter = 'brightness(1)';

  if (direction === 'next') {
    incomingSlot.style.transform = 'translate3d(0, 100%, 0)';
  } else {
    incomingSlot.style.transform = 'translate3d(0, -100%, 0)';
  }
  incomingSlot.classList.add('has-depth-shadow');

  // Force reflow to commit initial positions
  void incomingSlot.offsetWidth;

  // Start incoming video playback immediately
  incomingVideo.play().then(() => {
    cancelWatchdog();
    stageSpinner.style.opacity = '0';
  }).catch(() => {
    stageSpinner.style.opacity = '0';
  });

  // Apply silky spring transition
  incomingSlot.classList.add('is-animating');
  currSlot.classList.add('is-animating');

  if (direction === 'next') {
    currSlot.classList.add('slide-out-top');
    incomingSlot.classList.add('slide-in-center');
  } else {
    currSlot.classList.add('slide-out-bottom');
    incomingSlot.classList.add('slide-in-center');
  }

  // Telegram native haptic feedback
  if (window.Telegram?.WebApp?.HapticFeedback) {
    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
  }

  // Animation completion
  setTimeout(() => {
    currVideo.pause();

    // Clean up slots
    currSlot.className = 'video-slot';
    currSlot.style.transform = '';
    currSlot.style.opacity = '0';
    currSlot.style.filter = '';
    currSlot.classList.remove('has-depth-shadow', 'is-animating', 'slide-out-top', 'slide-out-bottom');

    incomingSlot.className = 'video-slot active-slot';
    incomingSlot.style.transform = '';
    incomingSlot.style.opacity = '1';
    incomingSlot.style.filter = '';
    incomingSlot.classList.remove('has-depth-shadow', 'is-animating', 'slide-in-center');

    // Swap active slot pointer
    activeSlotIndex = 1 - activeSlotIndex;
    isTransitioning = false;

    centerIndicator.classList.remove('active');
    updateSideRailUI(reel);

    // Buffer the next reel into the now-inactive slot
    prepareNextPreload();
  }, 390);

  // 4.5s watchdog timer in case video stalls or fails
  videoWatchdogTimer = setTimeout(() => {
    const actVid = getActiveVideo();
    if (actVid.readyState < 2 && (actVid.paused || actVid.currentTime === 0)) {
      handleVideoPlaybackError('timeout');
    }
  }, 4500);
}

// Update Side Rail Controls
function updateSideRailUI(reel) {
  if (!reel) return;
  const isLovedByMe = myLikedIds.has(reel.id);

  if (isLovedByMe) {
    btnLove.classList.add('loved');
    loveIcon.setAttribute('fill', 'currentColor');
  } else {
    btnLove.classList.remove('loved');
    loveIcon.setAttribute('fill', 'none');
  }

  loveCount.textContent = isLovedByMe ? 1 : 0;
  const cCount = (localComments[reel.id] || []).length;
  commentsCount.textContent = cCount;
}

// Navigate Next (Random + Preloaded)
function goNext() {
  if (isTransitioning) return;
  if (historyPointer < history.length - 1) {
    historyPointer++;
    const reel = history[historyPointer];
    playReel(reel, 'next');
  } else {
    const reel = nextPreloadedReel || pickRandomReel();
    history.push(reel);
    historyPointer = history.length - 1;
    playReel(reel, 'next');
  }
}

// Navigate Previous
function goPrevious() {
  if (isTransitioning) return;
  if (historyPointer > 0) {
    historyPointer--;
    const reel = history[historyPointer];
    playReel(reel, 'prev');
  } else {
    showToast('First reel in session');
  }
}

// Love React Toggle
function toggleLove() {
  if (historyPointer < 0 || !history[historyPointer]) return;
  const currentReel = history[historyPointer];
  const isLoved = myLikedIds.has(currentReel.id);

  if (isLoved) {
    myLikedIds.delete(currentReel.id);
  } else {
    myLikedIds.add(currentReel.id);
    heartBurst.classList.remove('animate');
    void heartBurst.offsetWidth;
    heartBurst.classList.add('animate');

    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
    }
  }

  localStorage.setItem(STORAGE_LIKES, JSON.stringify([...myLikedIds]));
  updateSideRailUI(currentReel);
}

// Tap on Video for Play / Pause & Double-Tap for Love
let lastTap = 0;
videoCarousel.addEventListener('click', (e) => {
  // If clicked on controls, ignore
  if (e.target.closest('.action-sidebar') || e.target.closest('.stage-header') || e.target.closest('.stage-scrubber')) {
    return;
  }

  const now = Date.now();
  if (now - lastTap < 300) {
    toggleLove();
    lastTap = 0;
  } else {
    lastTap = now;
    setTimeout(() => {
      if (lastTap === now) {
        const vid = getActiveVideo();
        if (vid.paused) {
          vid.play();
          centerIndicator.classList.remove('active');
        } else {
          vid.pause();
          centerIndicator.classList.add('active');
        }
      }
    }, 305);
  }
});

btnLove.addEventListener('click', toggleLove);

// Send Video to Telegram Inbox via Bot (Server-side fast dispatch, zero user data wait)
if (btnSendInbox) {
  let isSendingInbox = false;
  btnSendInbox.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (historyPointer < 0 || !history[historyPointer]) {
      showToast('No video playing');
      return;
    }
    if (isSendingInbox) return;
    isSendingInbox = true;

    const currentReel = history[historyPointer];
    const tg = window.Telegram?.WebApp;
    const initData = tg?.initData || '';

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('success');
    }

    // Immediate instant feedback — user never waits
    showToast('Sent to Telegram inbox! 📥⚡');

    try {
      const res = await fetch('/api/send_to_inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_data: initData,
          reel_url: currentReel.url
        })
      });
      const data = await res.json();
      if (!data.success && data.error !== 'Open inside bot to send') {
        showToast(data.error || 'Failed to deliver video');
      }
    } catch (err) {
      console.warn('Inbox request error:', err);
    } finally {
      setTimeout(() => { isSendingInbox = false; }, 800);
    }
  });
}

// ==========================================================================
// Interactive Touch Gestures (Drag-to-follow physics)
// ==========================================================================
let touchStartY = 0;
let touchStartX = 0;
let touchStartTime = 0;
let isDraggingTouch = false;

playerStage.addEventListener('touchstart', (e) => {
  if (isTransitioning || commentsOverlay.classList.contains('open')) return;
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
  touchStartTime = Date.now();
  isDraggingTouch = false;
}, { passive: true });

playerStage.addEventListener('touchmove', (e) => {
  if (isTransitioning || commentsOverlay.classList.contains('open')) return;
  const currentY = e.touches[0].clientY;
  const currentX = e.touches[0].clientX;
  const deltaY = currentY - touchStartY;
  const deltaX = currentX - touchStartX;

  // Ignore if horizontal swipe
  if (Math.abs(deltaX) > Math.abs(deltaY)) return;

  if (Math.abs(deltaY) > 8) {
    isDraggingTouch = true;
    const currSlot = getActiveSlot();
    const incomingSlot = getInactiveSlot();
    const incomingVideo = getInactiveVideo();

    currSlot.style.transition = 'none';
    incomingSlot.style.transition = 'none';

    if (deltaY < 0) {
      // Dragging Up: Revealing Next
      const candidateReel = (historyPointer < history.length - 1)
        ? history[historyPointer + 1]
        : (nextPreloadedReel || pickRandomReel());

      if (candidateReel && incomingVideo.src !== candidateReel.url) {
        incomingVideo.src = candidateReel.url;
        incomingVideo.muted = isMuted;
      }

      incomingSlot.style.opacity = '1';
      incomingSlot.classList.add('has-depth-shadow');
      incomingSlot.style.transform = `translate3d(0, calc(100% + ${deltaY}px), 0)`;

      const dragPct = Math.min(1, Math.abs(deltaY) / window.innerHeight);
      currSlot.style.transform = `translate3d(0, ${deltaY * 0.42}px, 0) scale(${1 - dragPct * 0.08})`;
      currSlot.style.opacity = `${1 - dragPct * 0.6}`;
      currSlot.style.filter = `brightness(${1 - dragPct * 0.35})`;
    } else if (deltaY > 0 && historyPointer > 0) {
      // Dragging Down: Revealing Previous
      const prevReel = history[historyPointer - 1];
      if (prevReel && incomingVideo.src !== prevReel.url) {
        incomingVideo.src = prevReel.url;
        incomingVideo.muted = isMuted;
      }

      incomingSlot.style.opacity = '1';
      incomingSlot.classList.add('has-depth-shadow');
      incomingSlot.style.transform = `translate3d(0, calc(-100% + ${deltaY}px), 0)`;

      const dragPct = Math.min(1, Math.abs(deltaY) / window.innerHeight);
      currSlot.style.transform = `translate3d(0, ${deltaY * 0.42}px, 0) scale(${1 - dragPct * 0.08})`;
      currSlot.style.opacity = `${1 - dragPct * 0.6}`;
      currSlot.style.filter = `brightness(${1 - dragPct * 0.35})`;
    }
  }
}, { passive: false });

playerStage.addEventListener('touchend', (e) => {
  if (isTransitioning || commentsOverlay.classList.contains('open')) return;
  const deltaY = e.changedTouches[0].clientY - touchStartY;
  const timeDiff = Date.now() - touchStartTime;
  const isFlick = timeDiff < 300 && Math.abs(deltaY) > 40;

  if (isDraggingTouch) {
    isDraggingTouch = false;
    if (deltaY < -60 || (isFlick && deltaY < 0)) {
      goNext();
    } else if ((deltaY > 60 || (isFlick && deltaY > 0)) && historyPointer > 0) {
      goPrevious();
    } else {
      // Smoothly spring back to current reel
      const currSlot = getActiveSlot();
      const incomingSlot = getInactiveSlot();

      currSlot.classList.add('is-animating');
      incomingSlot.classList.add('is-animating');

      currSlot.style.transform = 'translate3d(0, 0, 0) scale(1)';
      currSlot.style.opacity = '1';
      currSlot.style.filter = 'brightness(1)';

      if (deltaY < 0) {
        incomingSlot.style.transform = 'translate3d(0, 100%, 0)';
      } else {
        incomingSlot.style.transform = 'translate3d(0, -100%, 0)';
      }

      setTimeout(() => {
        currSlot.classList.remove('is-animating');
        incomingSlot.classList.remove('is-animating', 'has-depth-shadow');
        incomingSlot.style.opacity = '0';
      }, 300);
    }
  }
}, { passive: true });

// Mouse Wheel Navigation with Throttle
let wheelThrottle = false;
window.addEventListener('wheel', (e) => {
  if (wheelThrottle || isTransitioning || commentsOverlay.classList.contains('open')) return;
  if (Math.abs(e.deltaY) > 25) {
    wheelThrottle = true;
    if (e.deltaY > 0) goNext();
    else goPrevious();
    setTimeout(() => { wheelThrottle = false; }, 420);
  }
}, { passive: true });

// Video Buffering & Scrubbing on Both Elements
[videoA, videoB].forEach((vid) => {
  vid.addEventListener('waiting', () => {
    if (vid === getActiveVideo()) stageSpinner.style.opacity = '1';
  });
  vid.addEventListener('canplay', () => {
    if (vid === getActiveVideo()) {
      cancelWatchdog();
      stageSpinner.style.opacity = '0';
    }
  });
  vid.addEventListener('playing', () => {
    if (vid === getActiveVideo()) {
      cancelWatchdog();
      stageSpinner.style.opacity = '0';
    }
  });
  vid.addEventListener('error', () => {
    if (vid === getActiveVideo()) {
      handleVideoPlaybackError('media_error');
    }
  });
  vid.addEventListener('timeupdate', () => {
    if (vid === getActiveVideo() && vid.duration) {
      const pct = (vid.currentTime / vid.duration) * 100;
      scrubberFill.style.width = `${pct}%`;
    }
  });
});

scrubberBar.addEventListener('click', (e) => {
  e.stopPropagation();
  const rect = scrubberBar.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  const vid = getActiveVideo();
  if (vid.duration) {
    vid.currentTime = pos * vid.duration;
  }
});

// Audio Toggle
btnAudioToggle.addEventListener('click', () => {
  isMuted = !isMuted;
  videoA.muted = isMuted;
  videoB.muted = isMuted;

  if (isMuted) {
    audioIcon.innerHTML = `
      <line x1="1" y1="1" x2="23" y2="23"></line>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    `;
    showToast('Sound Muted 🔇');
  } else {
    audioIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
    showToast('Sound On 🔊');
  }
});

// Comments Drawer
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

  const comments = localComments[currentReel.id] || [];

  if (comments.length === 0) {
    commentsList.innerHTML = `
      <div class="empty-comments">
        No comments yet.<br>Be the first to write a comment!
      </div>`;
    return;
  }

  comments.forEach(c => {
    const bubble = document.createElement('div');
    bubble.className = 'comment-bubble';
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

  if (!localComments[currentReel.id]) localComments[currentReel.id] = [];
  localComments[currentReel.id].unshift(commentObj);
  localStorage.setItem(STORAGE_COMMENTS, JSON.stringify(localComments));

  clearCommentInput();
  renderComments();
  updateSideRailUI(currentReel);
  commentsList.scrollTop = 0;
}

// Built-in Keyboard Event Handling
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

// Keyboard Navigation
window.addEventListener('keydown', (e) => {
  if (commentsOverlay.classList.contains('open')) {
    if (e.key === 'Backspace') {
      e.preventDefault();
      deleteCommentChar();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submitComment();
    } else if (e.key === 'Escape') {
      closeComments();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      appendCommentChar(e.key);
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
    const vid = getActiveVideo();
    if (vid.paused) {
      vid.play();
      centerIndicator.classList.remove('active');
    } else {
      vid.pause();
      centerIndicator.classList.add('active');
    }
  } else if (key === 'm') {
    btnAudioToggle.click();
  } else if (key === 'l') {
    toggleLove();
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

  if (!initData) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
      document.getElementById('telegramGate').style.display = 'none';
      document.getElementById('playerApp').style.display = 'flex';
      return true;
    }
    document.getElementById('telegramGate').style.display = 'flex';
    document.getElementById('playerApp').style.display = 'none';
    return false;
  }

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

  document.getElementById('telegramGate').style.display = 'flex';
  document.getElementById('playerApp').style.display = 'none';
  return false;
}

// Initialize Application
async function init() {
  const isAllowed = await verifyTelegramWebApp();
  if (!isAllowed) {
    return;
  }

  try {
    const res = await fetch('reels.json');
    allUrls = await res.json();

    const firstReel = pickRandomReel();
    if (firstReel) {
      history.push(firstReel);
      historyPointer = 0;
      playReel(firstReel, null);
    }
  } catch (err) {
    console.error('Failed to load reels.json:', err);
  }
}

init();
