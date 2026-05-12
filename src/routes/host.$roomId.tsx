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
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const hostIdRef = useRef<string>(makePeerId());
  const fetchNetworkId = useServerFn(getNetworkId);

  // Broadcast presence on the local-network lobby so nearby devices
  // can discover this stream with one click.
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

  // Re-track whenever sharing state or viewer count changes
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

  useEffect(() => {
    const channel = supabase.channel(`room:${roomId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    channel.on("broadcast", { event: "hello" }, ({ payload }) => {
      const viewerId = payload.from as string;
      if (streamRef.current) {
        createOfferFor(viewerId);
      }
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      if (payload.to !== hostIdRef.current) return;
      const from = payload.from as string;
      const data = payload.data;
      const pc = peersRef.current.get(from);
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
    });

    channel.on("broadcast", { event: "bye" }, ({ payload }) => {
      const id = payload.from as string;
      const pc = peersRef.current.get(id);
      if (pc) {
        pc.close();
        peersRef.current.delete(id);
        setViewerCount(peersRef.current.size);
      }
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
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function createOfferFor(viewerId: string) {
    if (peersRef.current.has(viewerId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peersRef.current.set(viewerId, pc);
    setViewerCount(peersRef.current.size);

    streamRef.current!.getTracks().forEach((t) =>
      pc.addTrack(t, streamRef.current!)
    );

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

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    channelRef.current?.send({
      type: "broadcast",
      event: "signal",
      payload: {
        from: hostIdRef.current,
        to: viewerId,
        data: offer,
      },
    });
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

      // Announce so existing viewers can request offers
      await channelRef.current?.send({
        type: "broadcast",
        event: "host-ready",
        payload: { from: hostIdRef.current },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to start sharing";
      setError(msg);
    }
  }

  function stopSharing() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setViewerCount(0);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [selfId, setSelfId] = useState("");
  const [selfName, setSelfName] = useState("Host");
  useEffect(() => {
    setSelfId(getDeviceId());
    setSelfName(getDeviceName());
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-900">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          ScreenDrop
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

          <div className="flex-1 bg-black rounded-xl overflow-hidden flex items-center justify-center min-h-[240px]">
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

          {!stream ? (
            <button
              onClick={startSharing}
              className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-neutral-200"
            >
              Start Sharing
            </button>
          ) : (
            <button
              onClick={stopSharing}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-600"
            >
              Stop Sharing
            </button>
          )}

          {error && <div className="text-sm text-red-400">{error}</div>}
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
