import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { makeId } from "@/lib/webrtc";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "ScreenDrop — Instant screen sharing" },
      {
        name: "description",
        content:
          "Share your screen with anyone via a link. No installs, no signup.",
      },
    ],
  }),
});

function Home() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");

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

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-800" />
            <span className="text-xs text-neutral-500">or join a room</span>
            <div className="h-px flex-1 bg-neutral-800" />
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const id = code.trim().toLowerCase();
              if (id)
                navigate({ to: "/r/$roomId", params: { roomId: id } });
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
