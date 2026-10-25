import json
import os
import random
from typing import Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
import uvicorn

app = FastAPI(title="ReelStream")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load all reels from reels.json
with open(os.path.join(BASE_DIR, "reels.json"), "r", encoding="utf-8") as f:
    ALL_URLS = json.load(f)

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
        self.clients.add(websocket)

        # Send initial state directly to the newly joined user
        await websocket.send_json({
            "type": "init_state",
            "current_reel": self.current_reel,
            "is_paused": self.is_paused,
            "reel_likes": self.reel_likes,
            "comments": self.comments,
            "online_count": len(self.clients)
        })

        # Notify other existing clients that someone joined
        await self.broadcast({
            "type": "presence_update",
            "online_count": len(self.clients)
        }, sender=websocket)

    async def disconnect(self, websocket: WebSocket):
        self.clients.discard(websocket)
        # Broadcast updated presence to remaining clients
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
