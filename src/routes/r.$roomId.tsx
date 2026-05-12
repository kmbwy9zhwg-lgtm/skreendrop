import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ICE_SERVERS, makePeerId } from "@/lib/webrtc";
import type { RealtimeChannel } from "@supabase/supabase-js";

export const Route = createFileRoute("/r/$roomId")({
  component: ViewerPage,
});

function ViewerPage() {
  const { roomId } = Route.useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const hostIdRef = useRef<string | null>(null);
  const viewerIdRef = useRef<string>(makePeerId());

  const [status, setStatus] = useState("Connecting…");
  const [muted, setMuted] = useState(true);

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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <Link to="/" className="text-2xl font-semibold tracking-tight">
            ScreenDrop
          </Link>
          <span className="text-xs text-neutral-500">Viewer</span>
        </header>

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
      </div>
    </div>
  );
}
