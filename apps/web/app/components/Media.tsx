import { clsx } from 'clsx';
import { useState } from 'react';

/**
 * Media rendering with an editorial fallback. The API resolves stored keys to
 * public URLs; when there is no image yet (or R2 isn't configured) we render a
 * calm typographic tile rather than a broken <img>.
 */
export function Media({
  url,
  alt,
  label,
  className,
  aspect = 'square',
  rounded = false,
}: {
  url: string | null | undefined;
  alt?: string;
  /** Text used on the fallback tile (usually the product name). */
  label?: string;
  className?: string;
  aspect?: 'square' | 'portrait' | 'wide' | 'tall';
  rounded?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const aspectClass = {
    square: 'aspect-square',
    portrait: 'aspect-4/5',
    tall: 'aspect-3/4',
    wide: 'aspect-16/9',
  }[aspect];

  const showImage = url && !failed;
  return (
    <div
      className={clsx(
        'relative w-full overflow-hidden bg-soft',
        aspectClass,
        rounded ? 'rounded-full' : 'rounded-(--radius-card)',
        className,
      )}
    >
      {showImage ? (
        <img
          src={url}
          alt={alt ?? ''}
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
          <span className="line-clamp-3 font-display text-sm uppercase tracking-widest text-muted">
            {label ?? alt ?? 'VELORA'}
          </span>
        </div>
      )}
    </div>
  );
}
