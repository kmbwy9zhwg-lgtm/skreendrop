import { useEffect, useRef, useState } from "react";
import { createSocket, ICE_SERVERS } from "./socket";
import type { Socket } from "socket.io-client";

export default function Host({ roomId }: { roomId: string }) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamRef = useRef<MediaStream | null>(null);

  const shareUrl = `${window.location.origin}${window.location.pathname}#/r/${roomId}`;

  useEffect(() => {
    const s = createSocket();
    socketRef.current = s;
    s.on("connect", () => s.emit("host", { roomId }));
    s.on("error-msg", (m: string) => setError(m));

    s.on("viewer-joined", async ({ viewerId }: { viewerId: string }) => {
      if (!streamRef.current) return; // only after sharing started
      await createOfferFor(viewerId);
    });

    s.on("viewer-left", ({ viewerId }: { viewerId: string }) => {
      const pc = peersRef.current.get(viewerId);
      if (pc) {
        pc.close();
        peersRef.current.delete(viewerId);
      }
    });

    s.on("viewer-count", ({ count }: { count: number }) => setViewerCount(count));

    s.on(
      "signal",
      async ({ from, data }: { from: string; data: any }) => {
        let pc = peersRef.current.get(from);
        if (!pc) return;
        if (data.type === "answer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.candidate) {
          try {
            await pc.addIceCandidate(data);
          } catch (e) {
            console.warn(e);
          }
        }
      }
    );

    return () => {
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      s.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId]);

  async function createOfferFor(viewerId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(viewerId, pc);
    streamRef.current!.getTracks().forEach((t) =>
      pc.addTrack(t, streamRef.current!)
    );
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socketRef.current?.emit("signal", {
          to: viewerId,
          data: e.candidate.toJSON(),
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed"
      ) {
        pc.close();
        peersRef.current.delete(viewerId);
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit("signal", { to: viewerId, data: offer });
  }

  async function startSharing() {
    setError(null);
    try {
      const ms = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
      });
      streamRef.current = ms;
      setStream(ms);
      if (videoRef.current) videoRef.current.srcObject = ms;
      ms.getVideoTracks()[0].addEventListener("ended", stopSharing);
      // No viewers yet need offers (they'll be offered as they join).
    } catch (e: any) {
      setError(e?.message || "Failed to start sharing");
    }
  }

  function stopSharing() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-500">
            Room
          </div>
          <div className="font-mono text-lg">{roomId}</div>
        </div>
        <div className="text-sm text-neutral-400">
          Viewers: <span className="text-white">{viewerCount}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={shareUrl}
          className="flex-1 min-w-0 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={copyLink}
          className="px-4 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-sm"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
      </div>

      <div className="aspect-video rounded-xl bg-black overflow-hidden flex items-center justify-center">
        {stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-neutral-500 text-sm">No stream yet</div>
        )}
      </div>

      <div className="flex gap-2">
        {!stream ? (
          <button
            onClick={startSharing}
            className="flex-1 py-3 rounded-xl bg-white text-black font-medium hover:bg-neutral-200"
          >
            Start Sharing
          </button>
        ) : (
          <button
            onClick={stopSharing}
            className="flex-1 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600"
          >
            Stop Sharing
          </button>
        )}
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}
    </div>
  );
}
