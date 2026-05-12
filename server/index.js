import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// rooms: roomId -> { hostId: socketId | null, viewers: Set<socketId> }
const rooms = new Map();

function getRoom(roomId) {
  let r = rooms.get(roomId);
  if (!r) {
    r = { hostId: null, viewers: new Set() };
    rooms.set(roomId, r);
  }
  return r;
}

io.on("connection", (socket) => {
  let joinedRoom = null;
  let role = null; // "host" | "viewer"

  socket.on("host", ({ roomId }) => {
    const room = getRoom(roomId);
    if (room.hostId && room.hostId !== socket.id) {
      socket.emit("error-msg", "Room already has a host");
      return;
    }
    room.hostId = socket.id;
    joinedRoom = roomId;
    role = "host";
    socket.join(roomId);
    socket.emit("hosted", { roomId, viewerCount: room.viewers.size });
    // Notify host of existing viewers (if reconnect)
    for (const v of room.viewers) {
      socket.emit("viewer-joined", { viewerId: v });
    }
  });

  socket.on("join", ({ roomId }) => {
    const room = getRoom(roomId);
    joinedRoom = roomId;
    role = "viewer";
    room.viewers.add(socket.id);
    socket.join(roomId);
    socket.emit("joined", { roomId, hostPresent: !!room.hostId });
    if (room.hostId) {
      io.to(room.hostId).emit("viewer-joined", { viewerId: socket.id });
      io.to(room.hostId).emit("viewer-count", { count: room.viewers.size });
    }
  });

  // Signaling: relay between host and a specific viewer
  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    if (!joinedRoom) return;
    const room = rooms.get(joinedRoom);
    if (!room) return;
    if (role === "host" && room.hostId === socket.id) {
      room.hostId = null;
      // Notify viewers host gone
      for (const v of room.viewers) {
        io.to(v).emit("host-left");
      }
    } else if (role === "viewer") {
      room.viewers.delete(socket.id);
      if (room.hostId) {
        io.to(room.hostId).emit("viewer-left", { viewerId: socket.id });
        io.to(room.hostId).emit("viewer-count", { count: room.viewers.size });
      }
    }
    if (!room.hostId && room.viewers.size === 0) {
      rooms.delete(joinedRoom);
    }
  });
});

server.listen(PORT, () => {
  console.log(`ScreenDrop signaling server on :${PORT}`);
});
