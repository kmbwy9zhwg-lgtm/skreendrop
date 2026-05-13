import { createFileRoute, Link } from "@tanstack/react-router";

const SITE_URL = "https://skreendrop.lovable.app";
const PAGE_URL = `${SITE_URL}/free-screen-sharing`;

export const Route = createFileRoute("/free-screen-sharing")({
  component: LandingPage,
  head: () => ({
    meta: [
      {
        title:
          "Free Screen Sharing in Your Browser — No Signup, HD Streaming | Skreendrop",
      },
      {
        name: "description",
        content:
          "Skreendrop is the fastest free way to share your screen online. HD live streaming, chat, webcam overlay, adjustable quality — all in your browser, no signup or download.",
      },
      {
        name: "keywords",
        content:
          "free screen sharing, screen share online, browser screen share, share screen no signup, live screen streaming, screen sharing for meetings, screen share for tutorials, present online free",
      },
      {
        property: "og:title",
        content: "Free Screen Sharing in Your Browser — Skreendrop",
      },
      {
        property: "og:description",
        content:
          "Share your screen with anyone in seconds. HD live streaming, live chat, webcam overlay — no signup, no install.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:image", content: `${SITE_URL}/og-image.png` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Free Screen Sharing — Skreendrop" },
      {
        name: "twitter:description",
        content: "Free, no-signup HD browser screen sharing with live chat.",
      },
      { name: "twitter:image", content: `${SITE_URL}/og-image.png` },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: [
            {
              "@type": "Question",
              name: "Is Skreendrop really free?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Skreendrop is 100% free and requires no signup or installation. Just open the site in any modern browser and start sharing.",
              },
            },
            {
              "@type": "Question",
              name: "Do I need to install anything?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "No. Skreendrop runs entirely in your browser using WebRTC. There's nothing to download or install.",
              },
            },
            {
              "@type": "Question",
              name: "What screen quality is supported?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Skreendrop supports up to 1440p at 60fps with adjustable quality presets — Low (480p), Medium (720p), High (1080p), Ultra (1440p60) and Auto.",
              },
            },
            {
              "@type": "Question",
              name: "Can viewers chat with me while I stream?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Every session includes built-in real-time chat so viewers and the host can talk while sharing.",
              },
            },
            {
              "@type": "Question",
              name: "Is screen sharing on Skreendrop private?",
              acceptedAnswer: {
                "@type": "Answer",
                text: "Yes. Streams use peer-to-peer WebRTC and only people with your room link can join.",
              },
            },
          ],
        }),
      },
    ],
  }),
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-900">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Skreendrop
          </Link>
          <Link
            to="/"
            className="rounded-lg bg-white text-black text-sm font-medium px-4 py-2 hover:bg-neutral-200"
          >
            Start sharing
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 space-y-12">
        <section className="text-center space-y-4">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Free screen sharing — right in your browser
          </h1>
          <p className="text-lg text-neutral-400">
            Skreendrop lets you share your screen, webcam and audio with anyone in
            seconds. No signup. No download. Up to 1440p HD streaming with live
            chat.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link
              to="/"
              className="rounded-xl bg-white text-black font-medium px-5 py-3 hover:bg-neutral-200"
            >
              Share my screen
            </Link>
          </div>
        </section>

        <section className="grid sm:grid-cols-2 gap-4">
          {[
            { t: "HD live streaming", d: "Stream up to 1440p at 60fps with adjustable quality presets." },
            { t: "Live chat built-in", d: "Talk with viewers in real time while you present or play." },
            { t: "Webcam overlay", d: "Add a draggable webcam bubble on top of your shared screen." },
            { t: "No signup, no install", d: "Open the site, click share, send a link. That's it." },
            { t: "Private by default", d: "Peer-to-peer WebRTC. Only people with your link can join." },
            { t: "Works on any device", d: "Chrome, Edge, Safari and Firefox on desktop and mobile." },
          ].map((f) => (
            <div
              key={f.t}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <h2 className="text-base font-semibold">{f.t}</h2>
              <p className="text-sm text-neutral-400 mt-1">{f.d}</p>
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold">How screen sharing works</h2>
          <ol className="list-decimal list-inside space-y-2 text-neutral-300">
            <li>Click <strong>Start Sharing</strong> on the home page.</li>
            <li>Choose the screen, window or browser tab to share.</li>
            <li>Copy the room link and send it to your viewers.</li>
            <li>Pick your stream quality and start chatting in real time.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
          {[
            {
              q: "Is Skreendrop really free?",
              a: "Yes. Skreendrop is 100% free and requires no signup or installation.",
            },
            {
              q: "What quality can I stream at?",
              a: "Up to 1440p at 60fps. You can switch between Auto, Low, Medium, High and Ultra during the stream.",
            },
            {
              q: "Can viewers and the host chat?",
              a: "Yes — real-time chat is built into every session.",
            },
            {
              q: "Is it secure?",
              a: "Streams use peer-to-peer WebRTC and only people with your room link can join.",
            },
          ].map((f) => (
            <div
              key={f.q}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <h3 className="font-medium">{f.q}</h3>
              <p className="text-sm text-neutral-400 mt-1">{f.a}</p>
            </div>
          ))}
        </section>

        <section className="text-center pt-4">
          <Link
            to="/"
            className="inline-block rounded-xl bg-white text-black font-medium px-5 py-3 hover:bg-neutral-200"
          >
            Start a free screen share
          </Link>
        </section>
      </main>

      <footer className="border-t border-neutral-900 mt-12">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-neutral-500 flex justify-between">
          <span>© Skreendrop</span>
          <Link to="/" className="hover:text-white">Home</Link>
        </div>
      </footer>
    </div>
  );
}
