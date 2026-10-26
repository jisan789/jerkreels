import json
import os
import random
import hmac
import hashlib
import urllib.parse
import urllib.request
import asyncio
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from contextlib import asynccontextmanager
import uvicorn
import httpx


BOT_TOKEN = os.getenv("BOT_TOKEN", "8829502139:AAFJoUFRwv1LDljGtqvg9qRWgRLkD_VabsY")
BOT_USERNAME = os.getenv("BOT_USERNAME", "jerkreelsBot")


BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load all reels from reels.json
with open(os.path.join(BASE_DIR, "reels.json"), "r", encoding="utf-8") as f:
    ALL_URLS = json.load(f)

# Verify Telegram WebApp HMAC-SHA256 signature
def verify_telegram_init_data(init_data: str) -> dict:
    if not init_data:
        return None
    try:
        parsed = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
        if "hash" not in parsed:
            return None
        received_hash = parsed.pop("hash")
        data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(parsed.items()))
        secret_key = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
        if hmac.compare_digest(computed_hash, received_hash):
            user_data = json.loads(parsed.get("user", "{}"))
            return user_data
        return None
    except Exception:
        return None

# Background Bot Poller for /start & menu button
async def telegram_bot_worker():
    app_url = os.environ.get("RENDER_EXTERNAL_URL", "https://jerkreels.onrender.com")

    # Set Telegram Menu Button to open Web App
    try:
        menu_url = f"https://api.telegram.org/bot{BOT_TOKEN}/setChatMenuButton"
        payload = json.dumps({
            "menu_button": {
                "type": "web_app",
                "text": "🎬 Watch Reels",
                "web_app": {"url": app_url}
            }
        }).encode("utf-8")
        req = urllib.request.Request(menu_url, data=payload, headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass

    offset = 0
    while True:
        try:
            get_updates_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getUpdates?offset={offset}&timeout=20"
            req = urllib.request.Request(get_updates_url)
            with urllib.request.urlopen(req, timeout=25) as response:
                result = json.loads(response.read().decode())
                for update in result.get("result", []):
                    offset = update["update_id"] + 1
                    msg = update.get("message", {})
                    chat_id = msg.get("chat", {}).get("id")
                    text = msg.get("text", "")

                    if text.startswith("/start") and chat_id:
                        send_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
                        send_payload = json.dumps({
                            "chat_id": chat_id,
                            "text": "🎬 **Welcome to Jerkreels!**\n\nTap the button below to launch the Web App:",
                            "parse_mode": "Markdown",
                            "reply_markup": {
                                "inline_keyboard": [[
                                    {
                                        "text": "🚀 Open ReelStream",
                                        "web_app": {"url": app_url}
                                    }
                                ]]
                            }
                        }).encode("utf-8")
                        req_send = urllib.request.Request(send_url, data=send_payload, headers={"Content-Type": "application/json"})
                        urllib.request.urlopen(req_send, timeout=5)
        except Exception:
            await asyncio.sleep(4)
        await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start bot worker in background
    bot_task = asyncio.create_task(telegram_bot_worker())
    yield
    bot_task.cancel()

app = FastAPI(title="ReelStream Telegram App", lifespan=lifespan)

# Single Unified Live Watch Together Room
class LiveRoom:
    def __init__(self):
        random_idx = random.randint(0, len(ALL_URLS) - 1)
        self.clients: Set[WebSocket] = set()
        self.current_reel = {
            "id": random_idx + 1,
            "url": ALL_URLS[random_idx]
        }
        self.is_paused = False
        self.reel_likes = {}  # str(reel_id) -> real count
        self.comments = []     # list of live comments

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        if len(self.clients) == 0:
            random_idx = random.randint(0, len(ALL_URLS) - 1)
            self.current_reel = {
                "id": random_idx + 1,
                "url": ALL_URLS[random_idx]
            }
            self.is_paused = False
            self.comments = []
        self.clients.add(websocket)

        await websocket.send_json({
            "type": "init_state",
            "current_reel": self.current_reel,
            "is_paused": self.is_paused,
            "reel_likes": self.reel_likes,
            "comments": self.comments,
            "online_count": len(self.clients)
        })

        await self.broadcast({
            "type": "presence_update",
            "online_count": len(self.clients)
        }, sender=websocket)

    async def disconnect(self, websocket: WebSocket):
        self.clients.discard(websocket)
        await self.broadcast({
            "type": "presence_update",
            "online_count": len(self.clients)
        })

    async def broadcast(self, message: dict, sender: WebSocket = None):
        for client in list(self.clients):
            if sender is None or client != sender:
                try:
                    await client.send_json(message)
                except Exception:
                    pass

live_room = LiveRoom()

@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await live_room.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "change_reel":
                reel = data.get("reel")
                live_room.current_reel = reel
                await live_room.broadcast({
                    "type": "sync_reel",
                    "reel": reel
                }, sender=websocket)

            elif msg_type == "play_pause":
                is_paused = data.get("is_paused")
                live_room.is_paused = is_paused
                await live_room.broadcast({
                    "type": "sync_play_pause",
                    "is_paused": is_paused
                }, sender=websocket)

            elif msg_type == "seek":
                time = data.get("time")
                await live_room.broadcast({
                    "type": "sync_seek",
                    "time": time
                }, sender=websocket)

            elif msg_type == "love_react":
                reel_id = str(data.get("reel_id"))
                delta = data.get("delta", 1)
                current_count = live_room.reel_likes.get(reel_id, 0)
                new_count = max(0, current_count + delta)
                live_room.reel_likes[reel_id] = new_count

                await live_room.broadcast({
                    "type": "sync_love",
                    "reel_id": int(reel_id),
                    "count": new_count
                }, sender=websocket)

            elif msg_type == "comment":
                comment = data.get("comment")
                live_room.comments.insert(0, comment)
                await live_room.broadcast({
                    "type": "sync_comment",
                    "comment": comment
                }, sender=websocket)

    except WebSocketDisconnect:
        await live_room.disconnect(websocket)
    except Exception:
        await live_room.disconnect(websocket)

# Validate Telegram Web App initData
@app.post("/api/validate_twa")
async def validate_twa(request: Request):
    try:
        body = await request.json()
        init_data = body.get("init_data", "")
        user = verify_telegram_init_data(init_data)
        if user is not None:
            return JSONResponse({"valid": True, "user": user})
        return JSONResponse({"valid": False}, status_code=403)
    except Exception:
        return JSONResponse({"valid": False}, status_code=403)

# Background Worker: Downloads video directly on Render server network and uploads to Telegram Bot
async def deliver_video_to_telegram(chat_id: int, reel_url: str):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.xxxfollow.com/'
    }
    caption = "🎬 Here is your video from ReelStream!"

    # 1. Download on Render server gigabit network & upload as native Telegram MP4 file
    try:
        async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
            dl_resp = await client.get(reel_url, headers=headers)
            if dl_resp.status_code == 200 and len(dl_resp.content) > 1000:
                video_bytes = dl_resp.content
                files = {
                    'video': ('reel.mp4', video_bytes, 'video/mp4')
                }
                data = {
                    'chat_id': str(chat_id),
                    'caption': caption,
                    'supports_streaming': 'true'
                }
                tg_resp = await client.post(
                    f"https://api.telegram.org/bot{BOT_TOKEN}/sendVideo",
                    data=data,
                    files=files,
                    timeout=60.0
                )
                if tg_resp.status_code == 200 and tg_resp.json().get("ok"):
                    return True
    except Exception as exc:
        print(f"[Render Inbox Worker] Direct upload failed, trying URL dispatch: {exc}")

    # 2. Fallback: Ask Telegram to fetch the URL directly
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            tg_resp = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendVideo",
                json={
                    "chat_id": chat_id,
                    "video": reel_url,
                    "caption": caption,
                    "supports_streaming": True
                }
            )
            if tg_resp.status_code == 200 and tg_resp.json().get("ok"):
                return True
    except Exception as exc:
        print(f"[Render Inbox Worker] Telegram URL fetch failed: {exc}")

    # 3. Final Fallback: Send message with video preview
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": chat_id,
                    "text": f"🎬 *Here is your video:*\n{reel_url}",
                    "parse_mode": "Markdown",
                    "disable_web_page_preview": False
                }
            )
            return True
    except Exception as exc:
        print(f"[Render Inbox Worker] Fallback message failed: {exc}")

    return False


# Send Video directly to user's Telegram Inbox via the Bot (Server-side fast dispatch)
@app.post("/api/send_to_inbox")
async def send_to_inbox(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
        init_data = body.get("init_data", "")
        reel_url = body.get("reel_url", "")

        user = verify_telegram_init_data(init_data)
        if not user or "id" not in user:
            # Check local test mode
            client_host = request.client.host if request.client else ""
            if client_host in ("127.0.0.1", "localhost", "testclient"):
                return JSONResponse({"success": True, "note": "Local test mode"})
            return JSONResponse({"success": False, "error": "Open inside bot to send"}, status_code=403)

        chat_id = user["id"]
        if not reel_url:
            return JSONResponse({"success": False, "error": "No reel URL"}, status_code=400)

        # Offload download and upload completely to Render server in background
        background_tasks.add_task(deliver_video_to_telegram, chat_id, reel_url)

        # Return instant success to user without waiting for user network
        return JSONResponse({
            "success": True,
            "message": "Render server is delivering video to your Telegram inbox ⚡"
        })
    except Exception as exc:
        return JSONResponse({"success": False, "error": str(exc)}, status_code=500)


# Static file serving
@app.get("/")
async def get_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/style.css")
async def get_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")

@app.get("/app.js")
async def get_js():
    return FileResponse(os.path.join(BASE_DIR, "app.js"), media_type="application/javascript")

@app.get("/reels.json")
async def get_reels():
    return FileResponse(os.path.join(BASE_DIR, "reels.json"), media_type="application/json")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run("server:app", host="0.0.0.0", port=port, log_level="info")
