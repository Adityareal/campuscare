import type { CreateRoomInput, JoinInfo, JoinInfoInput, VideoProvider } from "@/lib/video/types";

const API = "https://api.daily.co/v1";
const TIMEOUT_MS = 10_000;

function config(): { apiKey: string; subdomain: string } {
  const apiKey = process.env.DAILY_API_KEY;
  const domain = process.env.DAILY_DOMAIN;
  if (!apiKey || !domain) throw new Error("The Daily video provider needs DAILY_API_KEY and DAILY_DOMAIN.");
  // Accept "school", "school.daily.co" or a full URL.
  const subdomain = domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.daily\.co$/i, "");
  if (!/^[a-z0-9-]+$/i.test(subdomain)) throw new Error("DAILY_DOMAIN is not a valid Daily subdomain.");
  return { apiKey, subdomain };
}

async function dailyPost(path: string, apiKey: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Daily API ${path} answered ${res.status}.`);
  return res.json();
}

const unixSeconds = (d: Date) => Math.floor(d.getTime() / 1000);

/**
 * Daily.co REST provider. Rooms are private and expire, so a leaked room name is useless without
 * a meeting token. Only the clinician's token is an owner token. No recording property is ever
 * set on a room or a token, so Daily's default (no recording) applies.
 */
export const dailyProvider: VideoProvider = {
  name: "daily",

  async createRoom({ roomName, expiresAt }: CreateRoomInput) {
    const { apiKey } = config();
    await dailyPost("/rooms", apiKey, {
      name: roomName,
      privacy: "private",
      properties: {
        exp: unixSeconds(expiresAt),
        eject_at_room_exp: true,
        enable_knocking: false,
        enable_prejoin_ui: false,
        max_participants: 2,
      },
    });
  },

  async joinInfo({ roomName, role, displayName, expiresAt }: JoinInfoInput): Promise<JoinInfo> {
    const { apiKey, subdomain } = config();
    const result = (await dailyPost("/meeting-tokens", apiKey, {
      properties: {
        room_name: roomName,
        user_name: displayName.slice(0, 60),
        is_owner: role === "clinician",
        exp: unixSeconds(expiresAt),
      },
    })) as { token?: unknown };
    if (typeof result.token !== "string" || !result.token) throw new Error("Daily did not return a meeting token.");
    const url = `https://${subdomain}.daily.co/${encodeURIComponent(roomName)}?t=${encodeURIComponent(result.token)}`;
    return { provider: "daily", kind: "embed", url };
  },
};
