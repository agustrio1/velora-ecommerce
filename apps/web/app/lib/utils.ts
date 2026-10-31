import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class composer: conditional classes + Tailwind conflict merging. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
