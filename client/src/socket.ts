import { io, Socket } from "socket.io-client";

const URL =
  (import.meta.env.VITE_SIGNAL_URL as string | undefined) ||
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3001`
    : "http://localhost:3001");

export function createSocket(): Socket {
  return io(URL, { transports: ["websocket"] });
}

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];
