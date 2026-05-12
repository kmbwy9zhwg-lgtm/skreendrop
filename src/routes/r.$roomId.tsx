import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, makePeerId } from "@/lib/webrtc";
import { getDeviceId, getDeviceName } from "@/lib/device";
import StreamChat from "@/components/StreamChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/r/$roomId")({
  component: ViewerPage,
});

function ViewerPage() {
  const { roomId } = Route.useParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const viewerIdRef = useRef<string>(makePeerId());

  const [status, setStatus] = useState("Connecting…");
  const [muted, setMuted] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("Viewer");

  useEffect(() => {
    setSelfId(getDeviceId());
    setSelfName(getDeviceName());
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const sayHello = () => {
      channel.send({
        type: "broadcast",
        event: "hello",
        payload: { from: viewerIdRef.current },
      });
    };

    channel.on("broadcast", { event: "host-here" }, ({ payload }) => {
      hostIdRef.current = payload.from as string;
      setStatus("Waiting for stream…");
      sayHello();
    });
    channel.on("broadcast", { event: "host-ready" }, ({ payload }) => {
      hostIdRef.current = payload.from as string;
      sayHello();
    });
    channel.on("broadcast", { event: "host-bye" }, () => {
      setStatus("Host left the room");
      pcRef.current?.close();
      pcRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (payload.to !== viewerIdRef.current) return;
      const from = payload.from as string;
      const data = payload.data;
      hostIdRef.current = from;

      if (data.type === "offer") {
        pcRef.current?.close();
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        pc.ontrack = (e) => {
          if (videoRef.current) {
            videoRef.current.srcObject = e.streams[0];
            setStatus("Live");
          }
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate && hostIdRef.current) {
            channel.send({
              type: "broadcast",
              event: "signal",
              payload: {
                from: viewerIdRef.current,
                to: hostIdRef.current,
                data: ev.candidate.toJSON(),
              },
            });
          }
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") setStatus("Connection failed");
          if (pc.connectionState === "disconnected") setStatus("Disconnected");
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channel.send({
          type: "broadcast",
          event: "signal",
          payload: {
            from: viewerIdRef.current,
            to: from,
            data: answer,
          },
        });
      } else if (data.candidate && pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(data);
        } catch (e) {
          console.warn(e);
        }
      }
    });

    channel.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        sayHello();
        setStatus("Waiting for host…");
      }
    });

    return () => {
      channel.send({
        type: "broadcast",
        event: "bye",
        payload: { from: viewerIdRef.current },
      });
      supabase.removeChannel(channel);
      pcRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function toggleMute() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  }

  async function togglePiP() {
    const v = videoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
    };
    if (!v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture?.();
      }
    } catch (e) {
      console.warn(e);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          ScreenDrop
        </Link>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="font-mono">{roomId}</span>
          <span className="hidden sm:inline">·</span>
          <span>{status}</span>
          <button
            onClick={() => setChatOpen((o) => !o)}
            className="lg:hidden relative ml-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 hover:bg-neutral-700"
          >
            Chat
            {unread > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[10px] font-bold rounded-full px-1.5">
                {unread}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0 p-3 sm:p-4">
          <div
            ref={containerRef}
            className="relative bg-black rounded-xl overflow-hidden flex-1 flex items-center justify-center group"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={muted}
              className="w-full h-full object-contain bg-black"
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur rounded-full px-2 py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
              <button
                onClick={toggleMute}
                className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇 Unmute" : "🔊 Mute"}
              </button>
              <button
                onClick={togglePiP}
                className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                title="Picture in picture"
              >
                ⧉ PiP
              </button>
              <button
                onClick={toggleFullscreen}
                className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                title="Fullscreen"
              >
                {isFullscreen ? "⤡ Exit" : "⛶ Fullscreen"}
              </button>
            </div>
          </div>
        </main>

        <div className="hidden lg:flex">
          <StreamChat
            roomId={roomId}
            selfId={selfId || "anon"}
            selfName={selfName}
            open={true}
            onClose={() => {}}
            onUnread={setUnread}
          />
        </div>
      </div>

      <div className="lg:hidden">
        <StreamChat
          roomId={roomId}
          selfId={selfId || "anon"}
          selfName={selfName}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnread={setUnread}
        />
      </div>
    </div>
  );
}
