import { useEffect, useState } from "react";
import Home from "./Home";
import Host from "./Host";
import Viewer from "./Viewer";

function getRoomFromHash(): string | null {
  const m = window.location.hash.match(/^#\/r\/([A-Za-z0-9_-]+)$/);
  return m ? m[1] : null;
}

export default function App() {
  const [room, setRoom] = useState<string | null>(getRoomFromHash());
  const [mode, setMode] = useState<"home" | "host" | "viewer">(
    getRoomFromHash() ? "viewer" : "home"
  );

  useEffect(() => {
    const onHash = () => {
      const r = getRoomFromHash();
      setRoom(r);
      if (r) setMode("viewer");
      else setMode("home");
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <h1
            className="text-2xl font-semibold tracking-tight cursor-pointer"
            onClick={() => {
              window.location.hash = "";
              setMode("home");
              setRoom(null);
            }}
          >
            ScreenDrop
          </h1>
          <span className="text-xs text-neutral-500">P2P screen sharing</span>
        </header>

        {mode === "home" && (
          <Home
            onStart={(id) => {
              setRoom(id);
              setMode("host");
            }}
            onJoin={(id) => {
              window.location.hash = `#/r/${id}`;
              setRoom(id);
              setMode("viewer");
            }}
          />
        )}
        {mode === "host" && room && <Host roomId={room} />}
        {mode === "viewer" && room && <Viewer roomId={room} />}
      </div>
    </div>
  );
}
