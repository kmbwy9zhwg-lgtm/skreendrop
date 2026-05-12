import { useEffect, useRef, useState } from "react";
import { createSocket, ICE_SERVERS } from "./socket";
import type { Socket } from "socket.io-client";

export default function Viewer({ roomId }: { roomId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState("Connecting…");
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const s = createSocket();
    socketRef.current = s;

    s.on("connect", () => s.emit("join", { roomId }));
    s.on("joined", ({ hostPresent }: { hostPresent: boolean }) => {
      setStatus(hostPresent ? "Waiting for stream…" : "Waiting for host…");
    });
    s.on("host-left", () => {
      setStatus("Host left the room");
      pcRef.current?.close();
      pcRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    s.on(
      "signal",
      async ({ from, data }: { from: string; data: any }) => {
        hostIdRef.current = from;
        if (data.type === "offer") {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pcRef.current = pc;
          pc.ontrack = (e) => {
            if (videoRef.current) {
              videoRef.current.srcObject = e.streams[0];
              setStatus("Live");
            }
          };
          pc.onicecandidate = (e) => {
            if (e.candidate && hostIdRef.current) {
              s.emit("signal", {
                to: hostIdRef.current,
                data: e.candidate.toJSON(),
              });
            }
          };
          pc.onconnectionstatechange = () => {
            if (pc.connectionState === "failed") setStatus("Connection failed");
            if (pc.connectionState === "disconnected")
              setStatus("Disconnected");
          };
          await pc.setRemoteDescription(new RTCSessionDescription(data));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          s.emit("signal", { to: from, data: answer });
        } else if (data.candidate && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(data);
          } catch (e) {
            console.warn(e);
          }
        }
      }
    );

    return () => {
      pcRef.current?.close();
      s.disconnect();
    };
  }, [roomId]);

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Room
          </div>
          <div className="font-mono text-lg">{roomId}</div>
        </div>
        <div className="text-sm text-neutral-400">{status}</div>
      </div>
      <div className="aspect-video rounded-xl bg-black overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-contain"
        />
      </div>
      <button
        onClick={toggleMute}
        className="px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-sm"
      >
        {muted ? "Unmute audio" : "Mute audio"}
      </button>
    </div>
  );
}
