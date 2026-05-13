import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, makePeerId } from "@/lib/webrtc";
import { getDeviceId, getDeviceName } from "@/lib/device";
import StreamChat from "@/components/StreamChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/r/$roomId")({
  component: ViewerPage,
  head: ({ params }) => ({
    meta: [
      { title: `Watch live screen share · Room ${params.roomId} — Skreendrop` },
      {
        name: "description",
        content:
          "Join a live screen sharing session on Skreendrop. Watch presentations, tutorials and gameplay directly in your browser — no signup, no install.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Watch a live screen share · Skreendrop" },
      {
        property: "og:description",
        content: "Tap to join a live browser screen sharing session with chat and HD streaming.",
      },
    ],
  }),
});

function ViewerPage() {
  const { roomId } = Route.useParams();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const viewerIdRef = useRef<string>(makePeerId());
  const metaRef = useRef<{ screenId: string | null; camId: string | null }>({
    screenId: null,
    camId: null,
  });
  const incomingStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  const [status, setStatus] = useState("Connecting…");
  const [muted, setMuted] = useState(true);
  const [micOn, setMicOn] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasCam, setHasCam] = useState(false);
  const [showCam, setShowCam] = useState(true);
  const [shareSources, setShareSources] = useState<Array<{ id: string; ownerName: string; label: string }>>([]);
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("Viewer");
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const micSenderRef = useRef<RTCRtpSender | null>(null);
  const viewerScreenStreamRef = useRef<MediaStream | null>(null);
  const viewerScreenSendersRef = useRef<RTCRtpSender[]>([]);

  // Draggable cam overlay
  const [camPos, setCamPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

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
    applyStreams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSourceId]);

  function applyStreams() {
    const { screenId, camId } = metaRef.current;
    const map = incomingStreamsRef.current;
    const selectedStream =
      (activeSourceId && map.get(activeSourceId)) ||
      (screenId ? map.get(screenId) : null) ||
      (camId ? map.get(camId) : null);

    if (videoRef.current) {
      if (videoRef.current.srcObject !== selectedStream) {
        videoRef.current.srcObject = selectedStream ?? null;
      }
    }
    const cs = camId ? map.get(camId) : null;
    setHasCam(!!cs);
    if (camRef.current) {
      if (camRef.current.srcObject !== cs) {
        camRef.current.srcObject = cs ?? null;
      }
    }
  }

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const sayHello = () => {
      channel.send({
        type: "broadcast",
        event: "hello",
        payload: { from: viewerIdRef.current, name: selfName },
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
      incomingStreamsRef.current.clear();
      if (videoRef.current) videoRef.current.srcObject = null;
      if (camRef.current) camRef.current.srcObject = null;
      setHasCam(false);
    });

    channel.on("broadcast", { event: "stream-meta" }, ({ payload }) => {
      metaRef.current = {
        screenId: payload.screenId ?? null,
        camId: payload.camId ?? null,
      };
      applyStreams();
    });

    channel.on("broadcast", { event: "share-meta" }, ({ payload }) => {
      const sources = (payload as { sources: Array<{ id: string; ownerName: string; label: string }> }).sources || [];
      setShareSources(sources);
      setActiveSourceId((current) =>
        current && sources.some((source) => source.id === current)
          ? current
          : sources[0]?.id ?? null
      );
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (payload.to !== viewerIdRef.current) return;
      const from = payload.from as string;
      const data = payload.data;
      hostIdRef.current = from;

      if (data.type === "offer") {
        let pc = pcRef.current;
        if (!pc) {
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pcRef.current = pc;

          pc.ontrack = (e) => {
            const stream = e.streams[0];
            if (stream) {
              incomingStreamsRef.current.set(stream.id, stream);
              stream.onremovetrack = () => {
                if (stream.getTracks().length === 0) {
                  incomingStreamsRef.current.delete(stream.id);
                  applyStreams();
                }
              };
            }
            applyStreams();
            setStatus("Live");
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
            if (pc!.connectionState === "failed")
              setStatus("Connection failed");
            if (pc!.connectionState === "disconnected")
              setStatus("Disconnected");
          };
        }

        if (micTrackRef.current && !micSenderRef.current) {
          micSenderRef.current = pc.addTrack(
            micTrackRef.current,
            new MediaStream([micTrackRef.current])
          );
        }
        if (viewerScreenStreamRef.current && viewerScreenSendersRef.current.length === 0) {
          viewerScreenSendersRef.current = viewerScreenStreamRef.current.getTracks().map((track) =>
            pc.addTrack(track, viewerScreenStreamRef.current!)
          );
        }

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
        // Ask host to resend meta in case ours is stale
        channel.send({
          type: "broadcast",
          event: "meta-please",
          payload: { from: viewerIdRef.current },
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

  async function toggleMic() {
    if (micTrackRef.current) {
      micSenderRef.current?.replaceTrack(null);
      micTrackRef.current.stop();
      micTrackRef.current = null;
      micSenderRef.current = null;
      setMicOn(false);
      await renegotiate();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micTrackRef.current = stream.getAudioTracks()[0];
      setMicOn(true);
      if (pcRef.current) {
        micSenderRef.current = pcRef.current.addTrack(
          micTrackRef.current,
          stream
        );
        await renegotiate();
      }
    } catch (e) {
      console.warn(e);
    }
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

  async function renegotiate() {
    const pc = pcRef.current;
    const hostId = hostIdRef.current;
    if (!pc || !hostId || !channelRef.current) return;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current.send({
      type: "broadcast",
      event: "signal",
      payload: {
        from: viewerIdRef.current,
        to: hostId,
        data: offer,
      },
    });
  }

  async function startSharingScreen() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      viewerScreenStreamRef.current = stream;
      setSharingScreen(true);
      if (pcRef.current) {
        viewerScreenSendersRef.current = stream.getTracks().map((track) =>
          pcRef.current!.addTrack(track, stream)
        );
        await renegotiate();
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", stopSharingScreen);
    } catch (e) {
      console.warn(e);
    }
  }

  async function stopSharingScreen() {
    viewerScreenSendersRef.current.forEach((sender) => {
      sender.track && pcRef.current?.removeTrack(sender);
    });
    viewerScreenSendersRef.current = [];
    viewerScreenStreamRef.current?.getTracks().forEach((track) => track.stop());
    viewerScreenStreamRef.current = null;
    setSharingScreen(false);
    await renegotiate();
  }

  // Drag handlers for cam overlay
  function onCamPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const camRect = target.getBoundingClientRect();
    dragRef.current = {
      dx: e.clientX - camRect.left,
      dy: e.clientY - camRect.top,
    };
    // initialize position from current corner if not set
    if (!camPos) {
      setCamPos({
        x: camRect.left - rect.left,
        y: camRect.top - rect.top,
      });
    }
  }
  function onCamPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const container = containerRef.current!;
    const rect = container.getBoundingClientRect();
    const target = e.currentTarget.getBoundingClientRect();
    let x = e.clientX - rect.left - dragRef.current.dx;
    let y = e.clientY - rect.top - dragRef.current.dy;
    x = Math.max(0, Math.min(x, rect.width - target.width));
    y = Math.max(0, Math.min(y, rect.height - target.height));
    setCamPos({ x, y });
  }
  function onCamPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Skreendrop
        </Link>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="font-mono">{roomId}</span>
          <span className="hidden sm:inline">·</span>
          <span>{status}</span>
          <button
            onClick={() => navigate({ to: "/" })}
            className="relative ml-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 hover:bg-neutral-700"
          >
            Share screen
          </button>
          <button
            onClick={() => setChatOpen((o) => !o)}
            className="relative ml-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 hover:bg-neutral-700"
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
      {shareSources.length > 0 && (
        <div className="px-4 py-3 border-b border-neutral-900 bg-neutral-900/50">
          <div className="text-xs text-neutral-400 mb-2 font-semibold uppercase tracking-wide">
            Available Sources ({shareSources.length}/4)
          </div>
          <div className="flex flex-wrap gap-2">
            {shareSources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setActiveSourceId(source.id)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  activeSourceId === source.id
                    ? "bg-white text-black border-white shadow-lg"
                    : "bg-neutral-800 border-neutral-700 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-600"
                }`}
              >
                {source.label}
                {activeSourceId === source.id && " ✓"}
              </button>
            ))}
          </div>
        </div>
      )}

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

            {/* Webcam overlay */}
            {hasCam && showCam && (
              <div
                onPointerDown={onCamPointerDown}
                onPointerMove={onCamPointerMove}
                onPointerUp={onCamPointerUp}
                style={
                  camPos
                    ? { left: camPos.x, top: camPos.y, right: "auto", bottom: "auto" }
                    : { right: 12, bottom: 12 }
                }
                className="absolute w-32 sm:w-44 aspect-video rounded-2xl overflow-hidden ring-2 ring-white/30 shadow-2xl shadow-black/70 cursor-grab active:cursor-grabbing touch-none bg-black"
                title="Drag to move"
              >
                <video
                  ref={camRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover pointer-events-none"
                />
              </div>
            )}

            {/* Player controls */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 backdrop-blur rounded-full px-2 py-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
              <button
                onClick={toggleMute}
                className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? "🔇 Unmute" : "🔊 Mute"}
              </button>
              <button
                onClick={toggleMic}
                className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                title={micOn ? "Turn mic off" : "Turn mic on"}
              >
                {micOn ? "🎤 Mic on" : "🎙️ Mic off"}
              </button>
              {hasCam && (
                <button
                  onClick={() => setShowCam((v) => !v)}
                  className="px-3 py-1.5 rounded-full text-xs hover:bg-white/10"
                  title="Toggle webcam overlay"
                >
                  {showCam ? "Hide cam" : "Show cam"}
                </button>
              )}
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
            open={chatOpen}
            onClose={() => setChatOpen(false)}
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
