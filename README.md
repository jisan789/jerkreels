# 🎬 ReelStream — Minimalist Solo & Shared Live Video Player

A clean, responsive, zero-swipe vertical video player for streaming random reels solo or together with others in a single shared live room.

---

## ✨ Features

- **No Separate Rooms**: There is only **one single shared live room**. No room creation, no room codes, and no passwords.
- **Two Seamless Modes**:
  - **Single View (Solo)**: Browse and watch random preloaded reels on your own.
  - **Watch Together**: Toggle "Watch Together" to automatically connect to the live room. Whenever someone else turns on Watch Together, you are instantly connected together!
- **Real-Time Live Synchronization**:
  - **Reel Sync**: When anyone in the live room clicks Next (<kbd>↓</kbd>) or Prev (<kbd>↑</kbd>), the exact same reel plays for everyone in real time.
  - **Love React Sync**: Double-tap and heart reacts trigger on all live viewers' screens with real-time count.
  - **Live Comments**: Comments are broadcast live to all active viewers.
  - **Presence Indicator**: Live status badge displays the count of connected viewers (`Live (2 online) 🟢`).
- **Zero-Swipe Fixed Stage**:
  - Pure video viewing with zero touch-drag lag or scrolling stutters.
  - Simple Up & Down button navigation.
  - Background preloading of the next random reel for instant playback.
- **Clean Architecture**:
  - Python backend (`FastAPI` + `Uvicorn` + `WebSockets`) with zero Node.js dependencies.

---

## 🚀 How to Run

```bash
python server.py
```

Open in your browser:
👉 **[http://localhost:3000](http://localhost:3000)**

- By default, you start in **Single View**.
- Click **"Watch Together"** in the top-right corner to automatically join the live room with other viewers.
- Click it again to return to **Single View** anytime.

---

## ⌨️ Controls & Keyboard Shortcuts

| Control | Action |
| --- | --- |
| <kbd>↓</kbd> or <kbd>J</kbd> | Next Random Reel (Synced live when in Watch Together) |
| <kbd>↑</kbd> or <kbd>K</kbd> | Previous Reel (Session History) |
| <kbd>Space</kbd> or Tap | Play / Pause (Synced live) |
| Double Tap on Screen | Love React (Heart burst on all screens) |
| <kbd>L</kbd> | Love React Toggle |
| <kbd>M</kbd> | Audio Mute / Unmute |
| <kbd>C</kbd> | Open Live Comments Drawer |
