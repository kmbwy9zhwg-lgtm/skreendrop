# ScreenDrop

Minimal PairDrop-style screen sharing. One sharer, many viewers, WebRTC mesh, Google STUN, Socket.IO signaling.

## Structure

```
/client   React + Vite + Tailwind + TypeScript
/server   Node + Express + Socket.IO signaling
```

## Run locally

Server:
```
cd server
npm install
npm run dev          # http://localhost:3001
```

Client:
```
cd client
npm install
npm run dev          # http://localhost:5173
```

Open the client, click **Start Sharing**, copy the link, open it in another tab/device.

Optional: set `VITE_SIGNAL_URL` to point the client to a non-local signaling server.

## Docker

```
docker compose up --build
```

- Client: http://localhost:5173
- Signaling: http://localhost:3001

## Notes

- Browsers only expose system audio on certain platforms (Chrome/Edge on Windows for full screen, or any platform when sharing a Chrome tab with "Share tab audio" checked).
- No TURN server: peers behind strict NATs may fail to connect. Add a TURN server for production.
- Mesh topology — fine for small rooms (<10 viewers).
