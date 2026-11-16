import type { JoinInfo, VideoProvider } from "@/lib/video/types";

/**
 * Development provider. There is no media relay: the room page shows only the local camera and
 * microphone preview and labels itself as a development room. Nothing is transmitted or stored.
 */
export const devProvider: VideoProvider = {
  name: "dev",
  async createRoom() {
    // Nothing to provision.
  },
  async joinInfo(): Promise<JoinInfo> {
    return { provider: "dev", kind: "preview", url: null };
  },
};
