/** Stored recordings end in one of the audio extensions the storage knows (A-141). */
export function isAudioUrl(url: string | null | undefined): url is string {
  return !!url && /\.(weba|webm|mp3|m4a|ogg|wav)(\?.*)?$/i.test(url);
}

/** A small inline player for a stored recording. */
export function AudioPlayer({
  src,
  label,
  testId,
}: {
  src: string;
  label?: string;
  testId?: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2" data-testid={testId}>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <audio controls preload="none" src={src} className="h-8 max-w-full" />
    </span>
  );
}
