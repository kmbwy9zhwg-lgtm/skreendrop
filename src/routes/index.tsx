import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { makeId } from "@/lib/webrtc";
import {
  getDeviceId,
  getDeviceName,
  getDeviceType,
  setDeviceName,
  type DeviceType,
} from "@/lib/device";
import { getNetworkId } from "@/lib/network.functions";

const SITE_URL = "https://skreendrop.lovable.app";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Skreendrop — Free browser screen sharing & live streaming" },
      {
        name: "description",
        content:
          "Skreendrop is a free, no-signup browser screen sharing app. Stream your screen, webcam and audio in HD to anyone via a link, with live chat and adjustable quality.",
      },
      {
        name: "keywords",
        content:
          "screen sharing, free screen share, browser screen sharing, share screen online, live screen streaming, webrtc screen share, no signup screen sharing, present online, share desktop browser",
      },
      { property: "og:title", content: "Skreendrop — Free browser screen sharing" },
      {
        property: "og:description",
        content:
          "Share your screen with anyone in seconds. HD streaming, live chat, webcam overlay — right in your browser.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Skreendrop — Free browser screen sharing" },
      {
        name: "twitter:description",
        content: "Free, no-signup HD screen sharing in your browser.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Skreendrop",
          url: SITE_URL,
          applicationCategory: "CommunicationApplication",
          operatingSystem: "Any (browser-based)",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          description:
            "Free, no-signup browser screen sharing with HD live streaming, chat, webcam overlay and adjustable quality.",
          featureList: [
            "Browser-based screen sharing",
            "HD live streaming up to 1440p60",
            "Adjustable stream quality",
            "Live chat with viewers",
            "Webcam and microphone overlay",
            "No signup or install required",
          ],
        }),
      },
    ],
  }),
});

type Status = "streaming" | "available" | "connecting" | "offline";

type Nearby = {
  deviceId: string;
  deviceName: string;
  deviceType?: DeviceType;
  sharing: boolean;
  roomId?: string;
  viewerCount?: number;
  status?: Status;
};

function statusMeta(status: Status) {
  switch (status) {
    case "streaming":
      return { dot: "bg-emerald-500", label: "Streaming", text: "text-emerald-400" };
    case "connecting":
      return { dot: "bg-amber-400", label: "Connecting", text: "text-amber-400" };
    case "offline":
      return { dot: "bg-red-500", label: "Offline", text: "text-red-400" };
    default:
      return { dot: "bg-neutral-300", label: "Available", text: "text-neutral-300" };
  }
}

function DeviceIcon({ type }: { type?: DeviceType }) {
  if (type === "mobile") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <line x1="11" y1="18" x2="13" y2="18" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function Home() {
  const navigate = useNavigate();
  const fetchNetworkId = useServerFn(getNetworkId);
  const [code, setCode] = useState("");
  const [nearby, setNearby] = useState<Nearby[]>([]);
  const [networkReady, setNetworkReady] = useState(false);
  // Hydration-safe: render placeholder on server, fill in on client
  const [deviceName, setDeviceNameState] = useState<string>("Device");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [requestToast, setRequestToast] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const deviceIdRef = useRef<string>("");
  const deviceTypeRef = useRef<DeviceType>("desktop");

  useEffect(() => {
    setDeviceNameState(getDeviceName());
    deviceIdRef.current = getDeviceId();
    deviceTypeRef.current = getDeviceType();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const deviceId = getDeviceId();
    deviceIdRef.current = deviceId;

    (async () => {
      const { networkId } = await fetchNetworkId();
      if (cancelled) return;
      channel = supabase.channel(`lobby:${networkId}`, {
        config: { presence: { key: deviceId } },
      });
      channelRef.current = channel;

      const refresh = () => {
        const state = channel!.presenceState() as Record<string, Array<Nearby>>;
        const list: Nearby[] = [];
        for (const key of Object.keys(state)) {
          if (key === deviceId) continue;
          const meta = state[key]?.[0];
          if (meta) {
            list.push({
              ...meta,
              status: meta.sharing ? "streaming" : "available",
            });
          }
        }
        setNearby(list);
      };

      channel.on("presence", { event: "sync" }, refresh);
      channel.on("presence", { event: "join" }, refresh);
      channel.on("presence", { event: "leave" }, refresh);

      channel.on("broadcast", { event: "share-request" }, ({ payload }) => {
        if (payload?.to !== deviceIdRef.current) return;
        setRequestToast(`${payload.fromName || "Someone"} requested you to share`);
        setTimeout(() => setRequestToast(null), 4000);
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel!.track({
            deviceId,
            deviceName: getDeviceName(),
            deviceType: getDeviceType(),
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

  const saveName = async () => {
    const trimmed = nameDraft.trim().slice(0, 32);
    if (!trimmed) {
      setEditingName(false);
      return;
    }
    setDeviceName(trimmed);
    setDeviceNameState(trimmed);
    setEditingName(false);
    const ch = channelRef.current;
    if (ch) {
      await ch.track({
        deviceId: deviceIdRef.current,
        deviceName: trimmed,
        deviceType: deviceTypeRef.current,
        sharing: false,
      } satisfies Nearby);
    }
  };

  const requestShare = async (target: Nearby) => {
    const ch = channelRef.current;
    if (!ch) return;
    await ch.send({
      type: "broadcast",
      event: "share-request",
      payload: {
        to: target.deviceId,
        from: deviceIdRef.current,
        fromName: deviceName,
      },
    });
    setRequestToast(`Asked ${target.deviceName} to share`);
    setTimeout(() => setRequestToast(null), 2500);
  };

  const sharers = nearby.filter((n) => n.sharing && n.roomId);
  const idle = nearby.filter((n) => !n.sharing);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">Skreendrop</h1>
          <p className="text-sm text-neutral-500 mt-2">
            Instant browser screen sharing
          </p>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm">
            <span className="text-neutral-500">You are</span>
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
                className="flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={saveName}
                  maxLength={32}
                  className="rounded-md bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm w-40 outline-none focus:border-neutral-500"
                />
              </form>
            ) : (
              <button
                onClick={() => {
                  setNameDraft(deviceName);
                  setEditingName(true);
                }}
                className="font-medium text-neutral-200 hover:text-white underline decoration-dotted underline-offset-4"
                title="Click to rename"
                suppressHydrationWarning
              >
                {deviceName}
              </button>
            )}
          </div>
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
            ) : sharers.length === 0 && idle.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No one else on this network yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {sharers.map((s) => {
                  const meta = statusMeta("streaming");
                  return (
                    <li
                      key={s.deviceId}
                      className="rounded-xl bg-emerald-500/5 border border-emerald-500/40 p-3 ring-1 ring-emerald-500/20"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-neutral-300">
                            <DeviceIcon type={s.deviceType} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {s.deviceName}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              <span className={meta.text}>
                                {meta.label}
                                {typeof s.viewerCount === "number"
                                  ? ` · ${s.viewerCount} viewer${s.viewerCount === 1 ? "" : "s"}`
                                  : ""}
                              </span>
                              <span className="text-neutral-600">·</span>
                              <span className="text-neutral-500 capitalize">
                                {s.deviceType ?? "desktop"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            navigate({
                              to: "/r/$roomId",
                              params: { roomId: s.roomId! },
                            })
                          }
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-xs font-medium hover:bg-emerald-400"
                        >
                          Watch Stream
                        </button>
                      </div>
                    </li>
                  );
                })}

                {idle.map((n) => {
                  const meta = statusMeta("available");
                  return (
                    <li
                      key={n.deviceId}
                      className="rounded-xl bg-neutral-900 border border-neutral-800 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-neutral-400">
                            <DeviceIcon type={n.deviceType} />
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm text-neutral-200 truncate">
                              {n.deviceName}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              <span className={meta.text}>{meta.label}</span>
                              <span className="text-neutral-600">·</span>
                              <span className="text-neutral-500 capitalize">
                                {n.deviceType ?? "desktop"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => requestShare(n)}
                          className="shrink-0 px-3 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-xs"
                        >
                          Request Share
                        </button>
                      </div>
                    </li>
                  );
                })}
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

        {requestToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-neutral-800 border border-neutral-700 px-4 py-2 text-sm shadow-lg">
            {requestToast}
          </div>
        )}
      </div>
    </div>
  );
}
