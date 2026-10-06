import { useState } from 'react';
import clsx from 'clsx';

/** Original generic player silhouette used whenever a public headshot is unavailable or fails to load. */
export function Silhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a4a6e" />
          <stop offset="1" stopColor="#1a2540" />
        </linearGradient>
      </defs>
      <path d="M50 14c-12 0-21 9-21 22 0 9 4 16 10 20l-1 5c-14 3-26 11-30 26-1 4 2 7 6 7h72c4 0 7-3 6-7-4-15-16-23-30-26l-1-5c6-4 10-11 10-20 0-13-9-22-21-22z" fill="url(#sil)" />
      <path d="M29 33c3-10 11-16 21-16s18 6 21 16c-6-3-13-4-21-4s-15 1-21 4z" fill="#4b5d85" opacity=".7" />
    </svg>
  );
}

/** nflverse headshot URLs point at full-resolution originals (several MB); request a resized rendition from the image CDN. */
export function sizedHeadshot(src: string | null, w: number): string | null {
  if (!src) return null;
  return src.replace(/\/(upload|private)\/f_auto,q_auto\//, `/$1/f_auto,q_auto,w_${w}/`);
}

export function Headshot({ src, alt, className = '', imgClassName = '', width = 200 }: { src: string | null; alt: string; className?: string; imgClassName?: string; width?: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={clsx('relative overflow-hidden', className)}>
      {src && !failed ? (
        <img src={sizedHeadshot(src, width)!} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={clsx('h-full w-full object-cover object-top', imgClassName)} />
      ) : (
        <Silhouette className="h-full w-full" />
      )}
    </div>
  );
}

export function TeamLogo({ src, abbr, size = 40, className = '' }: { src: string | null | undefined; abbr: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <span className={clsx('inline-grid place-items-center rounded-full bg-ink-600 display text-fg', className)} style={{ width: size, height: size, fontSize: size * 0.34 }} aria-label={abbr}>
        {abbr}
      </span>
    );
  return <img src={src} alt={`${abbr} logo`} width={size} height={size} loading="lazy" onError={() => setFailed(true)} className={clsx('object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]', className)} style={{ width: size, height: size }} />;
}
