import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { makeId } from "@/lib/webrtc";
import { getDeviceId, getDeviceName } from "@/lib/device";
import { getNetworkId } from "@/lib/network.functions";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "ScreenDrop — Instant screen sharing" },
      {
        name: "description",
        content:
          "Share your screen with anyone via a link, or instantly with devices on your network.",
      },
    ],
  }),
});

type Nearby = {
  deviceId: string;
  deviceName: string;
  sharing: boolean;
  roomId?: string;
};

function Home() {
  const navigate = useNavigate();
  const fetchNetworkId = useServerFn(getNetworkId);
  const [code, setCode] = useState("");
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [networkReady, setNetworkReady] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();

    (async () => {
      const { networkId } = await fetchNetworkId();
      if (cancelled) return;
      channel = supabase.channel(`lobby:${networkId}`, {
        config: { presence: { key: deviceId } },
      });
      channelRef.current = channel;

      const refresh = () => {
        const state = channel!.presenceState() as Record<
          string,
          Array<Nearby>
        >;
        const list: Nearby[] = [];
        for (const key of Object.keys(state)) {
          if (key === deviceId) continue;
          const meta = state[key]?.[0];
          if (meta) list.push(meta);
        }
        setNearby(list);
      };

      channel.on("presence", { event: "sync" }, refresh);
      channel.on("presence", { event: "join" }, refresh);
      channel.on("presence", { event: "leave" }, refresh);

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel!.track({
            deviceId,
            deviceName,
            sharing: false,
          } satisfies Nearby);
          setNetworkReady(true);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sharers = nearby.filter((n) => n.sharing && n.roomId);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">ScreenDrop</h1>
          <p className="text-sm text-neutral-500 mt-2">
            Instant browser screen sharing
          </p>
        </header>

        <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 space-y-6">
          <button
            onClick={() => {
              const id = makeId();
              navigate({ to: "/host/$roomId", params: { roomId: id } });
            }}
            className="w-full py-3 rounded-xl bg-white text-black font-medium hover:bg-neutral-200 transition"
          >
            Start Sharing
          </button>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                Nearby devices
              </span>
              <span className="relative flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${
                    networkReady ? "bg-emerald-400 animate-ping" : "bg-neutral-600"
                  } opacity-75`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    networkReady ? "bg-emerald-500" : "bg-neutral-600"
                  }`}
                />
              </span>
            </div>

            {!networkReady ? (
              <p className="text-sm text-neutral-500">Looking for devices…</p>
            ) : sharers.length === 0 && nearby.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No one else on this network yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sharers.map((s) => (
                  <li key={s.deviceId}>
                    <button
                      onClick={() =>
                        navigate({
                          to: "/r/$roomId",
                          params: { roomId: s.roomId! },
                        })
                      }
                      className="w-full flex items-center justify-between gap-3 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 px-4 py-3 text-left transition"
                    >
                      <div>
                        <div className="text-sm font-medium">{s.deviceName}</div>
                        <div className="text-xs text-emerald-400">
                          ● Live · click to watch
                        </div>
                      </div>
                      <span className="text-xs text-neutral-400">Join</span>
                    </button>
                  </li>
                ))}
                {nearby
                  .filter((n) => !n.sharing)
                  .map((n) => (
                    <li
                      key={n.deviceId}
                      className="flex items-center justify-between rounded-xl bg-neutral-900 border border-neutral-800 px-4 py-2"
                    >
                      <span className="text-sm text-neutral-400">
                        {n.deviceName}
                      </span>
                      <span className="text-xs text-neutral-600">idle</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs text-neutral-500">or join by code</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = code.trim().toLowerCase();
              if (id) navigate({ to: "/r/$roomId", params: { roomId: id } });
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Room code"
              className="flex-1 rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-neutral-500 text-sm"
            />
            <button className="px-5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-sm">
              Join
            </button>
          </form>
        </div>

        <p className="text-xs text-neutral-600 mt-6 text-center">
          Peer-to-peer via WebRTC. Audio sharing requires Chrome/Edge.
        </p>
      </div>
    </div>
  );
}
