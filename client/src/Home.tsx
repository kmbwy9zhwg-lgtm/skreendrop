import { useState } from "react";

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

export default function Home({
  onStart,
  onJoin,
}: {
  onStart: (id: string) => void;
  onJoin: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <div className="rounded-2xl bg-neutral-900 border border-neutral-800 p-8 space-y-6">
      <p className="text-neutral-400">
        Share your screen instantly — no signup, no installs.
      </p>
      <button
        onClick={() => onStart(makeRoomId())}
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
          if (code.trim()) onJoin(code.trim());
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Room code"
          className="flex-1 rounded-xl bg-neutral-800 border border-neutral-700 px-4 py-3 outline-none focus:border-neutral-500"
        />
        <button className="px-5 rounded-xl bg-neutral-800 border border-neutral-700 hover:bg-neutral-700">
          Join
        </button>
      </form>
    </div>
  );
}
