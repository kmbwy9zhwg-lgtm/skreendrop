import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, makePeerId } from "@/lib/webrtc";
import { getDeviceId, getDeviceName, getDeviceType } from "@/lib/device";
import { getNetworkId } from "@/lib/network.functions";
import StreamChat from "@/components/StreamChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/host/$roomId")({
  component: HostPage,
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const camPreviewRef = useRef<HTMLVideoElement>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const camStreamRef = useRef<MediaStream | null>(null);
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
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
  }

  function syncTracks(pc: RTCPeerConnection) {
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
      let audio = audioElementsRef.current.get(viewerId);
      if (!audio) {
        audio = document.createElement("audio");
        audio.autoplay = true;
        audio.hidden = true;
        audioElementsRef.current.set(viewerId, audio);
        document.body.appendChild(audio);
      }
      audio.srcObject = stream;
    };

    return pc;
  }

  async function sendOfferTo(viewerId: string, pc: RTCPeerConnection) {
    syncTracks(pc);
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
        syncTracks(pc);
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
      setViewers(prev => prev.filter(v => v.id !== id));
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
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
      }
    };

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
      if (videoRef.current) videoRef.current.srcObject = ms;
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

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const [chatOpen, setChatOpen] = useState(false);
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
            className="lg:hidden relative ml-2 rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 hover:bg-neutral-700"
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
            open={true}
            onClose={() => {}}
            onUnread={setUnread}
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
