import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, makePeerId } from "@/lib/webrtc";
import { getDeviceId, getDeviceName, getDeviceType } from "@/lib/device";
import { getNetworkId } from "@/lib/network.functions";
import StreamChat from "@/components/StreamChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

type QualityKey = "auto" | "low" | "medium" | "high" | "ultra";

const QUALITY_PRESETS: Record<
  QualityKey,
  { label: string; width?: number; height?: number; frameRate: number; bitrate: number; desc: string }
> = {
  auto: { label: "Auto", frameRate: 30, bitrate: 2_500_000, desc: "Adapts to network" },
  low: { label: "Low · 480p", width: 854, height: 480, frameRate: 15, bitrate: 800_000, desc: "Low bandwidth" },
  medium: { label: "Medium · 720p", width: 1280, height: 720, frameRate: 30, bitrate: 2_500_000, desc: "Balanced" },
  high: { label: "High · 1080p", width: 1920, height: 1080, frameRate: 30, bitrate: 5_000_000, desc: "Sharp detail" },
  ultra: { label: "Ultra · 1440p60", width: 2560, height: 1440, frameRate: 60, bitrate: 8_000_000, desc: "Gaming / motion" },
};

export const Route = createFileRoute("/host/$roomId")({
  component: HostPage,
  head: ({ params }) => ({
    meta: [
      { title: `Live screen share · Room ${params.roomId} — Skreendrop` },
      {
        name: "description",
        content:
          "Hosting a live screen share session on Skreendrop. Invite viewers with a link — no signup, no install, full HD streaming in your browser.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: `Live screen share · Skreendrop` },
      {
        property: "og:description",
        content: "Real-time browser screen sharing with chat, webcam overlay and adjustable quality.",
      },
    ],
  }),
});

function HostPage() {
  const { roomId } = Route.useParams();
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [viewers, setViewers] = useState<Array<{id: string, name: string}>>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [screenAudioMuted, setScreenAudioMuted] = useState(false);
  const [quality, setQuality] = useState<QualityKey>("auto");
  const qualityRef = useRef<QualityKey>("auto");

  const videoRef = useRef<HTMLVideoElement>(null);
  const camPreviewRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const viewerShareSourcesRef = useRef<Map<string, { stream: MediaStream; ownerId: string; ownerName: string; label: string }>>(new Map());
  const hostIdRef = useRef<string>(makePeerId());
  const fetchNetworkId = useServerFn(getNetworkId);

  // ---------- Lobby presence ----------
  const lobbyRef = useRef<RealtimeChannel | null>(null);
  const sharingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let lobby: RealtimeChannel | null = null;
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();
    const deviceType = getDeviceType();
    (async () => {
      const { networkId } = await fetchNetworkId();
      if (cancelled) return;
      lobby = supabase.channel(`lobby:${networkId}`, {
        config: { presence: { key: deviceId } },
      });
      lobbyRef.current = lobby;
      lobby.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await lobby!.track({
            deviceId,
            deviceName,
            deviceType,
            sharing: sharingRef.current,
            roomId,
            viewerCount: 0,
          });
        }
      });
    })();
    return () => {
      cancelled = true;
      lobbyRef.current = null;
      if (lobby) supabase.removeChannel(lobby);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    sharingRef.current = !!stream;
    const lobby = lobbyRef.current;
    if (!lobby) return;
    lobby.track({
      deviceId: getDeviceId(),
      deviceName: getDeviceName(),
      deviceType: getDeviceType(),
      sharing: !!stream,
      roomId,
      viewerCount,
    });
  }, [stream, viewerCount, roomId]);

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/r/${roomId}`
      : "";

  // ---------- Helpers ----------
  function broadcastShareSources() {
    const sources: Array<{ id: string; ownerId: string; ownerName: string; label: string }> = [];

    if (screenStreamRef.current) {
      sources.push({
        id: screenStreamRef.current.id,
        ownerId: hostIdRef.current,
        ownerName: getDeviceName(),
        label: "Host screen",
      });
    }

    viewerShareSourcesRef.current.forEach((info, id) => {
      sources.push({
        id,
        ownerId: info.ownerId,
        ownerName: info.ownerName,
        label: info.label,
      });
    });

    channelRef.current?.send({
      type: "broadcast",
      event: "share-meta",
      payload: { sources },
    });
  }

  function broadcastMeta() {
    channelRef.current?.send({
      type: "broadcast",
      event: "stream-meta",
      payload: {
        from: hostIdRef.current,
        screenId: screenStreamRef.current?.id ?? null,
        camId: camStreamRef.current?.id ?? null,
      },
    });
    broadcastShareSources();
  }

  function syncTracks(pc: RTCPeerConnection, viewerId?: string) {
    const desired: Array<{ track: MediaStreamTrack; stream: MediaStream }> = [];
    const ss = screenStreamRef.current;
    if (ss) {
      ss.getTracks().forEach((t) => desired.push({ track: t, stream: ss }));
    }
    const cs = camStreamRef.current;
    if (cs) {
      cs.getTracks().forEach((t) => desired.push({ track: t, stream: cs }));
    }
    if (micTrackRef.current) {
      const micStream = ss ?? new MediaStream([micTrackRef.current]);
      desired.push({ track: micTrackRef.current, stream: micStream });
    }

    viewerShareSourcesRef.current.forEach((info) => {
      if (info.ownerId === viewerId) return;
      info.stream.getTracks().forEach((t) => desired.push({ track: t, stream: info.stream }));
    });

    for (const sender of pc.getSenders()) {
      if (!desired.find((d) => d.track === sender.track)) {
        try {
          pc.removeTrack(sender);
        } catch (e) {
          console.warn(e);
        }
      }
    }
    for (const d of desired) {
      if (!pc.getSenders().find((s) => s.track === d.track)) {
        pc.addTrack(d.track, d.stream);
      }
    }
  }

  function createPeerConnection(viewerId: string) {
    let pc = peersRef.current.get(viewerId);
    if (pc) return pc;

    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(viewerId, pc);
    setViewerCount(peersRef.current.size);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        channelRef.current?.send({
          type: "broadcast",
          event: "signal",
          payload: {
            from: hostIdRef.current,
            to: viewerId,
            data: e.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        pc.close();
        peersRef.current.delete(viewerId);
        setViewerCount(peersRef.current.size);
        const audio = audioElementsRef.current.get(viewerId);
        if (audio) {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
          audioElementsRef.current.delete(viewerId);
        }
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      const ownerName = viewers.find((v) => v.id === viewerId)?.name ?? "Viewer";
      const hasVideo = stream.getVideoTracks().length > 0;
      if (hasVideo && !viewerShareSourcesRef.current.has(stream.id)) {
        // Enforce 4-share limit (host screen + 3 viewer screens max)
        if (viewerShareSourcesRef.current.size >= 3) {
          console.warn("Maximum 4 concurrent shares (1 host + 3 viewers) reached. Rejecting share from", ownerName);
          return;
        }
        const clonedTracks = stream.getTracks().map((track) => track.clone());
        const clonedStream = new MediaStream(clonedTracks);
        viewerShareSourcesRef.current.set(stream.id, {
          stream: clonedStream,
          ownerId: viewerId,
          ownerName,
          label: `${ownerName} screen`,
        });
        broadcastMeta();
        renegotiateAll();

        stream.onremovetrack = () => {
          if (stream.getVideoTracks().length === 0) {
            const info = viewerShareSourcesRef.current.get(stream.id);
            if (info) {
              info.stream.getTracks().forEach((track) => track.stop());
            }
            viewerShareSourcesRef.current.delete(stream.id);
            broadcastMeta();
            renegotiateAll();
          }
        };
      }

      if (stream.getAudioTracks().length > 0) {
        let audio = audioElementsRef.current.get(viewerId);
        if (!audio) {
          audio = document.createElement("audio");
          audio.autoplay = true;
          audio.hidden = true;
          audioElementsRef.current.set(viewerId, audio);
          document.body.appendChild(audio);
        }
        audio.srcObject = stream;
      }
    };

    return pc;
  }

  async function sendOfferTo(viewerId: string, pc: RTCPeerConnection) {
    syncTracks(pc, viewerId);
    // Apply current quality to all video senders for this peer
    const preset = QUALITY_PRESETS[qualityRef.current];
    for (const sender of pc.getSenders()) {
      if (!sender.track || sender.track.kind !== "video") continue;
      if (camStreamRef.current && sender.track === camStreamRef.current.getVideoTracks()[0]) continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        params.encodings[0].maxBitrate = preset.bitrate;
        params.encodings[0].maxFramerate = preset.frameRate;
        await sender.setParameters(params);
      } catch (e) {
        console.warn(e);
      }
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { from: hostIdRef.current, to: viewerId, data: offer },
    });
  }

  async function renegotiateAll() {
    for (const [vid, pc] of peersRef.current) {
      try {
        await sendOfferTo(vid, pc);
      } catch (e) {
        console.warn(e);
      }
    }
    broadcastMeta();
  }

  // ---------- Signaling channel ----------
  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "hello" }, ({ payload }) => {
      const viewerId = payload.from as string;
      const viewerName = payload.name as string || "Viewer";
      setViewers(prev => {
        const existing = prev.find(v => v.id === viewerId);
        if (!existing) {
          return [...prev, { id: viewerId, name: viewerName }];
        } else if (existing.name !== viewerName) {
          return prev.map(v => v.id === viewerId ? { ...v, name: viewerName } : v);
        }
        return prev;
      });
      if (screenStreamRef.current) {
        createOfferFor(viewerId);
      }
    });

    channel.on("broadcast", { event: "meta-please" }, () => {
      broadcastMeta();
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (payload.to !== hostIdRef.current) return;
      const from = payload.from as string;
      const data = payload.data;
      if (data.type === "answer") {
        const pc = peersRef.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(data));
      } else if (data.type === "offer") {
        const pc = createPeerConnection(from);
        syncTracks(pc, from);
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        channelRef.current?.send({
          type: "broadcast",
          event: "signal",
          payload: { from: hostIdRef.current, to: from, data: answer },
        });
      } else if (data.candidate) {
        const pc = peersRef.current.get(from);
        if (!pc) return;
        try {
          await pc.addIceCandidate(data);
        } catch (e) {
          console.warn(e);
        }
      }
    });

    channel.on("broadcast", { event: "bye" }, ({ payload }) => {
      const id = payload.from as string;
      const pc = peersRef.current.get(id);
      if (pc) {
        pc.close();
        peersRef.current.delete(id);
        setViewerCount(peersRef.current.size);
      }
      viewerShareSourcesRef.current.forEach((info, streamId) => {
        if (info.ownerId === id) {
          info.stream.getTracks().forEach((track) => track.stop());
          viewerShareSourcesRef.current.delete(streamId);
        }
      });
      setViewers((prev) => prev.filter((v) => v.id !== id));
      broadcastMeta();
      renegotiateAll();
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "host-here",
          payload: { from: hostIdRef.current },
        });
      }
    });

    return () => {
      channel.send({
        type: "broadcast",
        event: "host-bye",
        payload: { from: hostIdRef.current },
      });
      supabase.removeChannel(channel);
      peersRef.current.forEach((pc) => pc.close());
      peersRef.current.clear();
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      camStreamRef.current?.getTracks().forEach((t) => t.stop());
      micTrackRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function createOfferFor(viewerId: string) {
    if (peersRef.current.has(viewerId)) return;
    const pc = createPeerConnection(viewerId);
    await sendOfferTo(viewerId, pc);
    broadcastMeta();
  }

  // ---------- Capture controls ----------
  async function startSharing() {
    setError(null);
    try {
      const ms = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
      });
      screenStreamRef.current = ms;
      setStream(ms);
      if (videoRef.current) {
        videoRef.current.srcObject = ms;
        await videoRef.current.play().catch((e) => console.warn("Auto-play failed:", e));
      }
      ms.getVideoTracks()[0].addEventListener("ended", stopSharing);

      await channelRef.current?.send({
        type: "broadcast",
        event: "host-ready",
        payload: { from: hostIdRef.current },
      });
      // Existing peers (rare at start) renegotiate
      await renegotiateAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start sharing";
      setError(msg);
    }
  }

  function stopSharing() {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    camStreamRef.current?.getTracks().forEach((t) => t.stop());
    camStreamRef.current = null;
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    setStream(null);
    setCamOn(false);
    setMicOn(false);
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setViewerCount(0);
  }

  async function toggleCam() {
    setError(null);
    try {
      if (camStreamRef.current) {
        camStreamRef.current.getTracks().forEach((t) => t.stop());
        camStreamRef.current = null;
        setCamOn(false);
        if (camPreviewRef.current) camPreviewRef.current.srcObject = null;
      } else {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
        });
        camStreamRef.current = s;
        setCamOn(true);
        if (camPreviewRef.current) camPreviewRef.current.srcObject = s;
      }
      await renegotiateAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to toggle camera");
    }
  }

  async function toggleMic() {
    setError(null);
    try {
      if (micTrackRef.current) {
        micTrackRef.current.stop();
        micTrackRef.current = null;
        setMicOn(false);
      } else {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        micTrackRef.current = s.getAudioTracks()[0];
        setMicOn(true);
      }
      await renegotiateAll();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to toggle mic");
    }
  }

  function toggleScreenAudio() {
    const ss = screenStreamRef.current;
    if (!ss) return;
    const next = !screenAudioMuted;
    ss.getAudioTracks().forEach((t) => (t.enabled = !next));
    setScreenAudioMuted(next);
  }

  async function applyQuality(key: QualityKey) {
    setQuality(key);
    qualityRef.current = key;
    const preset = QUALITY_PRESETS[key];
    const ss = screenStreamRef.current;
    if (ss) {
      const vt = ss.getVideoTracks()[0];
      if (vt) {
        const constraints: MediaTrackConstraints = { frameRate: preset.frameRate };
        if (preset.width && preset.height) {
          constraints.width = { ideal: preset.width };
          constraints.height = { ideal: preset.height };
        }
        try {
          await vt.applyConstraints(constraints);
        } catch (e) {
          console.warn("applyConstraints failed", e);
        }
      }
    }
    // Update encoding bitrate on every viewer connection
    for (const pc of peersRef.current.values()) {
      for (const sender of pc.getSenders()) {
        if (!sender.track || sender.track.kind !== "video") continue;
        if (camStreamRef.current && sender.track === camStreamRef.current.getVideoTracks()[0]) continue;
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = preset.bitrate;
          params.encodings[0].maxFramerate = preset.frameRate;
          await sender.setParameters(params);
        } catch (e) {
          console.warn("setParameters failed", e);
        }
      }
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const [chatOpen, setChatOpen] = useState(true);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("Host");
  useEffect(() => {
    setSelfId(getDeviceId());
    setSelfName(getDeviceName());
  }, []);

  const sharing = !!stream;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Skreendrop
        </Link>
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="font-mono">{roomId}</span>
          <span>·</span>
          <span>
            <span className="text-white font-medium">{viewerCount}</span> viewer
            {viewerCount === 1 ? "" : "s"}
          </span>
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
          <button
            onClick={() => setViewersOpen((o) => !o)}
            className="lg:hidden relative ml-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 hover:bg-neutral-700"
          >
            Viewers
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <main className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={copyLink}
              className="px-4 rounded-lg bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-sm"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>

          <div className="relative flex-1 bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[240px]">
            {sharing ? (
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
            {camOn && (
              <video
                ref={camPreviewRef}
                autoPlay
                muted
                playsInline
                className="absolute bottom-3 right-3 w-32 sm:w-40 aspect-video rounded-xl object-cover ring-2 ring-white/20 shadow-2xl shadow-black/60 bg-black"
              />
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!sharing ? (
              <button
                onClick={startSharing}
                className="flex-1 min-w-[160px] py-3 rounded-xl bg-white text-black font-medium hover:bg-neutral-200"
              >
                Start Sharing
              </button>
            ) : (
              <>
                <ControlButton
                  active={camOn}
                  onClick={toggleCam}
                  label={camOn ? "Cam on" : "Cam off"}
                  icon="📷"
                />
                <ControlButton
                  active={micOn}
                  onClick={toggleMic}
                  label={micOn ? "Mic on" : "Mic off"}
                  icon="🎤"
                />
                <ControlButton
                  active={!screenAudioMuted}
                  onClick={toggleScreenAudio}
                  label={screenAudioMuted ? "System muted" : "System audio"}
                  icon="🔊"
                  disabled={!screenStreamRef.current?.getAudioTracks().length}
                />
                <div className="flex items-center gap-1.5 rounded-xl bg-neutral-900 border border-neutral-800 px-2 py-1.5">
                  <span aria-hidden className="text-sm">⚙️</span>
                  <label htmlFor="quality" className="sr-only">Stream quality</label>
                  <select
                    id="quality"
                    value={quality}
                    onChange={(e) => applyQuality(e.target.value as QualityKey)}
                    className="bg-transparent text-sm text-neutral-200 outline-none cursor-pointer pr-1"
                    title={QUALITY_PRESETS[quality].desc}
                  >
                    {(Object.keys(QUALITY_PRESETS) as QualityKey[]).map((k) => (
                      <option key={k} value={k} className="bg-neutral-900">
                        {QUALITY_PRESETS[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={stopSharing}
                  className="ml-auto px-4 py-2 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600 text-sm"
                >
                  End stream
                </button>
              </>
            )}
          </div>

          {error && <div className="text-sm text-red-400">{error}</div>}
        </main>

        <div className="hidden lg:flex">
          {viewersOpen && (
            <aside className="w-48 bg-neutral-900 border-l border-neutral-800 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-medium">Viewers ({viewers.length})</div>
                <button
                  onClick={() => setViewersOpen(false)}
                  className="text-neutral-400 hover:text-white text-sm"
                  aria-label="Close viewers"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3">
                {viewers.length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center mt-4">
                    No viewers yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {viewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="text-sm text-neutral-100 bg-neutral-800 rounded-lg px-3 py-2"
                      >
                        {viewer.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
          <StreamChat
            roomId={roomId}
            selfId={selfId || "anon"}
            selfName={selfName}
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            onUnread={setUnread}
            canTag={true}
            participants={[selfName, ...viewers.map((viewer) => viewer.name)]}
          />
        </div>
      </div>

      <div className="lg:hidden">
        {viewersOpen && (
          <aside className="fixed lg:static top-0 right-0 z-30 h-full w-full sm:w-80 bg-neutral-950 lg:bg-neutral-900 border-l border-neutral-800 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="text-sm font-medium">Viewers ({viewers.length})</div>
              <button
                onClick={() => setViewersOpen(false)}
                className="text-neutral-400 hover:text-white text-sm"
                aria-label="Close viewers"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              {viewers.length === 0 ? (
                <p className="text-xs text-neutral-500 text-center mt-4">
                  No viewers yet
                </p>
              ) : (
                <div className="space-y-2">
                  {viewers.map((viewer) => (
                    <div
                      key={viewer.id}
                      className="text-sm text-neutral-100 bg-neutral-800 rounded-lg px-3 py-2"
                    >
                      {viewer.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
        <StreamChat
          roomId={roomId}
          selfId={selfId || "anon"}
          selfName={selfName}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnread={setUnread}
          canTag={true}
          participants={[selfName, ...viewers.map((viewer) => viewer.name)]}
        />
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  label,
  icon,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 rounded-xl text-sm border transition flex items-center gap-2 ${
        disabled
          ? "bg-neutral-900 border-neutral-800 text-neutral-600 cursor-not-allowed"
          : active
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25"
          : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800"
      }`}
    >
      <span aria-hidden>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
