import { useToast } from '@/context/ToastContext';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ImagePlus, Loader2, Star, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Media } from '../Media';
import { Button } from '../ui/button';
import { Input } from '../ui/form';

type MediaFolder = 'products' | 'variants' | 'banners' | 'categories' | 'brands' | 'pages';

/** Resolve a stored R2 key to a public URL (absolute keys pass through). */
export function mediaSrc(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key) || key.startsWith('/')) return key;
  return `/media/${key.replace(/^\/+/, '')}`;
}

interface UploadResult {
  key: string;
  url: string;
}

async function uploadFile(file: File, folder: MediaFolder): Promise<UploadResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('folder', folder);
  return api.upload<UploadResult>('/media/upload', form);
}

/* ----------------------------- single image ------------------------------- */

/** One R2-backed image: drag/drop or pick a file, or paste the object key. */
export function ImageField({
  imageKey,
  onChange,
  folder = 'banners',
  label = 'Gambar',
  hint,
}: {
  imageKey: string;
  onChange: (key: string, url: string | null) => void;
  folder?: MediaFolder;
  label?: string;
  hint?: string;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, folder);
      onChange(result.key, result.url);
      toast.push('Gambar diunggah', 'success');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Unggahan gagal', 'error');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex items-center gap-3 rounded-(--radius-card) border border-dashed px-3 py-3 transition-colors',
          dragging ? 'border-accent bg-soft/60' : 'border-line bg-canvas/40',
        )}
      >
        <div className="w-24 shrink-0">
          <Media url={mediaSrc(imageKey)} label="Pratinjau" aspect="wide" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload /> Pilih gambar
            </Button>
            {imageKey ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange('', null)}>
                <Trash2 /> Hapus
              </Button>
            ) : null}
          </div>
          <Input
            value={imageKey}
            onChange={(event) => onChange(event.target.value, null)}
            placeholder="atau tempel kunci R2: banners/hero.jpg"
            className="h-8 text-xs"
            aria-label="Kunci media"
          />
          <p className="text-[0.68rem] text-muted">{hint ?? 'Taruh berkas di sini atau pilih dari perangkat.'}</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFiles(event.target.files)}
        />
      </div>
    </div>
  );
}

/* ------------------------------- gallery ---------------------------------- */

export interface GalleryImage {
  imageKey: string;
  alt: string;
  isPrimary: boolean;
}

/** Multi-image editor for products: upload, reorder, choose the primary shot. */
export function ImageGallery({
  images,
  onChange,
  folder = 'products',
}: {
  images: GalleryImage[];
  onChange: (next: GalleryImage[]) => void;
  folder?: MediaFolder;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: GalleryImage[] = [];
    try {
      for (const file of Array.from(files)) {
        const result = await uploadFile(file, folder);
        added.push({ imageKey: result.key, alt: '', isPrimary: false });
      }
      const next = [...images, ...added];
      onChange(next.map((image, index) => ({ ...image, isPrimary: index === next.findIndex((x) => x.isPrimary) })));
      toast.push(`${added.length} gambar diunggah`, 'success');
    } catch (err) {
      toast.push(err instanceof ApiError ? err.message : 'Unggahan gagal', 'error');
    } finally {
      setUploading(false);
    }
  }

  function setPrimary(index: number) {
    onChange(images.map((image, i) => ({ ...image, isPrimary: i === index })));
  }

  function remove(index: number) {
    const next = images.filter((_, i) => i !== index);
    if (next.length && !next.some((image) => image.isPrimary)) next[0].isPrimary = true;
    onChange(next);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted">Galeri ({images.length})</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus /> Unggah
        </Button>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          'grid grid-cols-2 gap-3 rounded-(--radius-card) border border-dashed p-3 sm:grid-cols-3',
          dragging ? 'border-accent bg-soft/50' : 'border-line',
        )}
      >
        {images.map((image, index) => (
          <div key={`${image.imageKey}-${index}`} className="group relative space-y-1.5">
            <Media url={mediaSrc(image.imageKey)} label={image.imageKey} aspect="portrait" />
            <button
              type="button"
              onClick={() => setPrimary(index)}
              aria-label="Jadikan gambar utama"
              title="Jadikan utama"
              className={cn(
                'absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border bg-surface/90 transition-colors',
                image.isPrimary ? 'border-accent text-accent' : 'border-line text-muted hover:text-ink',
              )}
            >
              <Star className={cn('h-3.5 w-3.5', image.isPrimary && 'fill-accent')} />
            </button>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label="Hapus gambar"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface/90 text-muted transition-colors hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <div className="flex items-center justify-between gap-1">
              <Input
                value={image.alt}
                onChange={(event) =>
                  onChange(images.map((item, i) => (i === index ? { ...item, alt: event.target.value } : item)))
                }
                placeholder="alt"
                className="h-7 px-2 text-xs"
                aria-label="Teks alternatif"
              />
              <div className="flex shrink-0">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="px-1 text-xs text-muted disabled:opacity-30"
                  aria-label="Geser ke kiri"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === images.length - 1}
                  className="px-1 text-xs text-muted disabled:opacity-30"
                  aria-label="Geser ke kanan"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        ))}

        {uploading ? (
          <div className="flex aspect-4/5 items-center justify-center rounded-(--radius-card) border border-line bg-soft/40">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-4/5 flex-col items-center justify-center gap-1.5 rounded-(--radius-card) border border-line bg-canvas/50 text-xs text-muted transition-colors hover:border-accent hover:text-ink"
        >
          <ImagePlus className="h-5 w-5" />
          Tambah
        </button>
      </div>

      <p className="text-[0.68rem] text-muted">
        Tarik berkas ke area ini untuk mengunggah. Bintang menandai gambar utama di katalog.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </div>
  );
}
