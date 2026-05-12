import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createHash } from "crypto";

/**
 * Returns a stable hash of the caller's public IP so that devices behind the
 * same NAT (same Wi-Fi / LAN) can discover each other on a shared channel
 * without exposing the raw IP to the browser.
 */
export const getNetworkId = createServerFn({ method: "GET" }).handler(
  async () => {
    const req = getRequest();
    const h = req.headers;
    const raw =
      h.get("cf-connecting-ip") ||
      h.get("x-real-ip") ||
      (h.get("x-forwarded-for") || "").split(",")[0].trim() ||
      "unknown";
    const salt = process.env.NETWORK_SALT || "screendrop";
    const hash = createHash("sha256").update(salt + ":" + raw).digest("hex");
    return { networkId: hash.slice(0, 16) };
  },
);
