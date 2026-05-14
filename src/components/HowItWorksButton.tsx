import { useEffect, useState } from "react";

export default function HowItWorksButton({
  className = "",
  label = "How it works",
}: {
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ||
          "inline-flex items-center gap-1.5 rounded-full bg-neutral-800/80 border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 backdrop-blur"
        }
        aria-label="Learn how Skreendrop works"
      >
        <span aria-hidden>💡</span>
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="how-it-works-title"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
              <h2 id="how-it-works-title" className="text-base font-semibold">
                How Skreendrop works
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-neutral-400 hover:text-white text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-4 text-sm text-neutral-300">
              <p>
                Skreendrop is a free, no-signup tool that lets you stream your
                screen, webcam or back camera live to anyone — straight from
                your browser.
              </p>

              <Step
                num="1"
                title="Start a session"
                body="Tap Start Sharing. On a desktop you'll be asked to pick a screen, window or tab. On a phone, your back camera turns on automatically (since phones can't share their screen)."
              />
              <Step
                num="2"
                title="Invite viewers"
                body="Copy the link or share the room code. Anyone with the link can watch — no install, no account."
              />
              <Step
                num="3"
                title="Talk and chat"
                body="Optionally turn on your microphone and webcam. Use the live chat to talk to viewers in real time."
              />
              <Step
                num="4"
                title="Tune the quality"
                body="Pick Auto, 720p, 1080p or Ultra 1440p60 from the ⚙️ menu depending on your network."
              />

              <div className="rounded-lg bg-neutral-800/60 border border-neutral-700/60 p-3 text-xs text-neutral-400">
                <strong className="text-neutral-200">Phone users:</strong>{" "}
                Mobile browsers can't capture the screen, so Skreendrop
                automatically streams your <em>back camera</em> instead. You
                can still join any room and watch other people's streams
                normally.
              </div>

              <p className="text-xs text-neutral-500">
                Streams are peer-to-peer via WebRTC — your video doesn't sit on
                our servers.
              </p>
            </div>

            <div className="px-5 py-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-neutral-200"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-7 w-7 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-center">
        {num}
      </div>
      <div>
        <div className="text-sm font-medium text-neutral-100">{title}</div>
        <p className="text-xs text-neutral-400 mt-0.5">{body}</p>
      </div>
    </div>
  );
}
