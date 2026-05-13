import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Skreendrop — Free Browser Screen Sharing & Live Streaming" },
      {
        name: "description",
        content:
          "Skreendrop is a free, no-signup browser screen sharing and live streaming tool. Share your screen instantly with nearby devices on the same Wi-Fi (like PairDrop) or anyone via a link — peer-to-peer over WebRTC.",
      },
      {
        name: "keywords",
        content:
          "screen sharing, browser screen share, live streaming, screen mirror, share screen online, free screen sharing, no signup screen share, peer to peer screen sharing, WebRTC screen share, PairDrop alternative, local network screen sharing, screen share with audio, share screen browser, instant screen sharing, online presentation tool",
      },
      { name: "author", content: "Skreendrop" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "theme-color", content: "#10b981" },
      { name: "application-name", content: "Skreendrop" },
      { name: "apple-mobile-web-app-title", content: "Skreendrop" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },

      { property: "og:site_name", content: "Skreendrop" },
      { property: "og:title", content: "Skreendrop — Free Browser Screen Sharing & Live Streaming" },
      {
        property: "og:description",
        content:
          "Instantly share your screen with nearby devices or anyone via a link. No signup, no install, peer-to-peer over WebRTC.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://skreendrop.lovable.app" },
      { property: "og:image", content: "https://skreendrop.lovable.app/og-image.png" },
      { property: "og:image:width", content: "1408" },
      { property: "og:image:height", content: "768" },
      { property: "og:image:alt", content: "Skreendrop — Local Sharing. Live Streaming." },
      { property: "og:locale", content: "en_US" },

      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Skreendrop — Free Browser Screen Sharing & Live Streaming" },
      {
        name: "twitter:description",
        content:
          "Instantly share your screen with nearby devices or anyone via a link. No signup, no install, peer-to-peer over WebRTC.",
      },
      { name: "twitter:image", content: "https://skreendrop.lovable.app/og-image.png" },
      { name: "twitter:image:alt", content: "Skreendrop — Local Sharing. Live Streaming." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: "https://skreendrop.lovable.app" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              name: "Skreendrop",
              url: "https://skreendrop.lovable.app",
              applicationCategory: "MultimediaApplication",
              operatingSystem: "Any (Web)",
              browserRequirements: "Requires a modern browser with WebRTC support",
              description:
                "Free, no-signup browser screen sharing and live streaming. Share your screen with nearby devices on the same Wi-Fi or anyone via a link — peer-to-peer over WebRTC.",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              featureList: [
                "Instant screen sharing in the browser",
                "Local network device discovery (PairDrop-style)",
                "Live streaming with audio",
                "Webcam and microphone overlay",
                "Real-time chat with viewers",
                "Picture-in-picture and fullscreen",
                "No signup, no installation",
                "End-to-end peer-to-peer over WebRTC",
              ],
              image: "https://skreendrop.lovable.app/og-image.png",
            },
            {
              "@type": "Organization",
              name: "Skreendrop",
              url: "https://skreendrop.lovable.app",
              logo: "https://skreendrop.lovable.app/logo.png",
            },
            {
              "@type": "WebSite",
              name: "Skreendrop",
              url: "https://skreendrop.lovable.app",
              potentialAction: {
                "@type": "SearchAction",
                target: "https://skreendrop.lovable.app/r/{search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Is Skreendrop free to use?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Skreendrop is completely free, with no signup or installation required.",
                  },
                },
                {
                  "@type": "Question",
                  name: "How does Skreendrop work on the same Wi-Fi?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Open the site on devices on the same network and they appear instantly under Nearby Devices, similar to PairDrop. One click starts watching a stream — no room code needed.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Can I share my screen with audio?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Yes. Skreendrop supports system audio capture in Chrome and Edge, plus optional microphone and webcam overlay while screen sharing.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Is screen sharing private and secure?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Streams travel directly between devices over WebRTC peer-to-peer connections. Skreendrop never stores or relays your video.",
                  },
                },
              ],
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
