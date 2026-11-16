"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { MicrophoneIcon, MicrophoneSlashIcon, VideoCameraIcon, VideoCameraSlashIcon } from "@phosphor-icons/react";
import { Button, ButtonLink, Notice } from "@/components/ui";
import type { ActionState } from "@/lib/action-state";
import { fill } from "@/lib/i18n";
import type { CareText } from "@/lib/i18n/care";

export type RoomJoin = { kind: "embed" | "preview"; url: string | null };

type Props = {
  appointmentId: string;
  counterpartName: string;
  labels: CareText["consult"];
  recordingOffText: string;
  join: RoomJoin;
  counterpartJoined: boolean;
  alreadyJoined: boolean;
  leaveHref: string;
  help: { href: string; label: string } | null;
  joinAction: (appointmentId: string) => Promise<ActionState>;
};

const REFRESH_MS = 15_000;

/**
 * Device check and room for one consultation. The local preview never leaves the device. Every
 * track is stopped when the component unmounts, when a hosted room takes over the devices, and
 * when the person leaves.
 */
export function ConsultationRoom({
  appointmentId,
  counterpartName,
  labels,
  recordingOffText,
  join: initialJoin,
  counterpartJoined,
  alreadyJoined,
  leaveHref,
  help,
  joinAction,
}: Props) {
  const router = useRouter();
  // Hosted join links carry a fresh token on every server render, so keep the first one.
  const [join] = useState(initialJoin);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const aliveRef = useRef(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(alreadyJoined);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream, joined]);

  useEffect(() => {
    if (counterpartJoined) return;
    const timer = window.setInterval(() => router.refresh(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [counterpartJoined, router]);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }

  async function startCheck() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(labels.noMedia);
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!aliveRef.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = media;
      setStream(media);
      setCamOn(true);
      setMicOn(true);
    } catch {
      setError(labels.deviceError);
    }
  }

  function toggleCamera() {
    const next = !camOn;
    stream?.getVideoTracks().forEach((track) => {
      track.enabled = next;
    });
    setCamOn(next);
  }

  function toggleMic() {
    const next = !micOn;
    stream?.getAudioTracks().forEach((track) => {
      track.enabled = next;
    });
    setMicOn(next);
  }

  function enterRoom() {
    setError(null);
    startTransition(async () => {
      const result = await joinAction(appointmentId);
      if (result.status === "error") {
        setError(result.message ?? labels.joinFailed);
        return;
      }
      // A hosted room asks the browser for the devices itself, so release ours first.
      if (join.kind === "embed") stopStream();
      setJoined(true);
    });
  }

  const showPreview = !!stream && (!joined || join.kind === "preview");

  return (
    <div className="grid gap-6">
      <p role="status" className="text-sm text-ink-2">
        {counterpartJoined ? fill(labels.otherJoined, { name: counterpartName }) : fill(labels.waitingFor, { name: counterpartName })}
      </p>

      {error ? (
        <Notice tone="warning" role="alert">
          {error}
        </Notice>
      ) : null}

      {joined && join.kind === "embed" && join.url ? (
        <iframe
          title={labels.sessionTitle}
          src={join.url}
          allow="camera; microphone; display-capture"
          className="h-[70vh] min-h-96 w-full rounded-panel border border-line bg-surface-2"
        />
      ) : null}

      {joined && join.kind === "preview" ? <Notice tone="warning">{labels.devRoom}</Notice> : null}
      {joined ? <p className="text-sm text-ink-2">{labels.joinedNote}</p> : null}

      {!joined || join.kind === "preview" ? (
        <section aria-labelledby="device-check-heading" className="grid gap-4 rounded-panel border border-line bg-surface px-5 py-5">
          <div>
            <h2 id="device-check-heading" className="text-base font-semibold">
              {labels.deviceCheckTitle}
            </h2>
            <p className="mt-1 text-sm text-ink-3">{labels.deviceCheckHelp}</p>
          </div>

          {showPreview ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              aria-label={labels.previewLabel}
              className="aspect-video w-full max-w-xl rounded-panel border border-line bg-surface-2 object-cover"
            />
          ) : null}

          <div className="flex flex-wrap gap-2">
            {stream ? (
              <>
                <Button variant="secondary" onClick={toggleCamera} aria-pressed={camOn}>
                  {camOn ? <VideoCameraIcon size={20} aria-hidden /> : <VideoCameraSlashIcon size={20} aria-hidden />}
                  {camOn ? labels.cameraOn : labels.cameraOff}
                </Button>
                <Button variant="secondary" onClick={toggleMic} aria-pressed={micOn}>
                  {micOn ? <MicrophoneIcon size={20} aria-hidden /> : <MicrophoneSlashIcon size={20} aria-hidden />}
                  {micOn ? labels.micOn : labels.micOff}
                </Button>
              </>
            ) : (
              <Button variant="secondary" onClick={startCheck}>
                {labels.startCheck}
              </Button>
            )}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {!joined ? (
          <Button onClick={enterRoom} disabled={pending} aria-busy={pending || undefined}>
            {pending ? labels.joining : labels.joinNow}
          </Button>
        ) : null}
        <ButtonLink variant="secondary" href={leaveHref}>
          {labels.leave}
        </ButtonLink>
        {help ? (
          <ButtonLink variant="ghost" href={help.href}>
            {help.label}
          </ButtonLink>
        ) : null}
      </div>

      <p className="text-sm text-ink-3">{recordingOffText}</p>
    </div>
  );
}
