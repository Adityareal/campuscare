/** What a consultation room needs from a video backend. Providers never enable recording. */
export type VideoRole = "clinician" | "student";

export type JoinInfo = {
  provider: "dev" | "daily";
  /** "embed": render `url` in an iframe. "preview": a development room with no media relay. */
  kind: "embed" | "preview";
  url: string | null;
};

export type CreateRoomInput = { roomName: string; expiresAt: Date };

export type JoinInfoInput = { roomName: string; role: VideoRole; displayName: string; expiresAt: Date };

export interface VideoProvider {
  readonly name: "dev" | "daily";
  createRoom(input: CreateRoomInput): Promise<void>;
  joinInfo(input: JoinInfoInput): Promise<JoinInfo>;
}
