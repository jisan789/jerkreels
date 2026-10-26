# 🎬 ReelStream — Minimalist Smooth Reel Video Player

A sleek, responsive, zero-flicker vertical video player for streaming random reels with native dual-slot transitions and finger-drag physics.

---

## ✨ Features

- **Dual-Slot Smooth Transition Engine**:
  - Zero black-screen flash or decoder lag when switching reels.
  - Active video glides out while the incoming video slides smoothly in with native spring physics (`cubic-bezier(0.2, 0.95, 0.25, 1)`).
  - Background preloading of the next random reel for instant playback.
- **Finger Swipe & Drag-to-Follow Gestures**:
  - Drag up or down on touch devices with real-time responsive tracking.
  - Momentum flick detection and rubber-band springback.
- **Micro-Interactions & Haptic Feedback**:
  - Native Telegram Web App haptic feedback on reel changes and double-tap love reactions.
  - Double-tap animated heart pop burst.
- **Direct Telegram Bot Inbox**:
  - One-tap "Inbox" button to send the current video directly to your Telegram bot chat.
- **Clean Architecture**:
  - Python backend (`FastAPI` + `Uvicorn`) with Telegram WebApp HMAC verification.
  - Vanilla JS + CSS3 hardware-accelerated animations.

---

## 🚀 How to Run

```bash
python server.py
```

Open in your browser:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## ⌨️ Controls & Keyboard Shortcuts

| Control | Action |
| --- | --- |
| <kbd>↓</kbd> or <kbd>J</kbd> | Next Random Reel (Smooth Transition) |
| <kbd>↑</kbd> or <kbd>K</kbd> | Previous Reel (Session History) |
| <kbd>Space</kbd> or Tap | Play / Pause |
| Double Tap on Screen | Love React (Heart burst) |
| <kbd>L</kbd> | Love React Toggle |
| <kbd>M</kbd> | Audio Mute / Unmute |
| <kbd>C</kbd> | Open Comments Drawer |
