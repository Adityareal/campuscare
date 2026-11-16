import { dailyProvider } from "@/lib/video/daily";
import { devProvider } from "@/lib/video/dev";
import type { VideoProvider } from "@/lib/video/types";

export type { CreateRoomInput, JoinInfo, JoinInfoInput, VideoProvider, VideoRole } from "@/lib/video/types";

/** Resolves a provider by its stored name. Anything unrecognised is the development provider,
 * which transmits nothing. */
export function getVideoProvider(name: string | null | undefined): VideoProvider {
  return name === "daily" ? dailyProvider : devProvider;
}

/** Provider used for rooms created from now on (VIDEO_PROVIDER, default "dev"). */
export function configuredVideoProvider(): VideoProvider {
  return getVideoProvider(process.env.VIDEO_PROVIDER?.trim().toLowerCase());
}
