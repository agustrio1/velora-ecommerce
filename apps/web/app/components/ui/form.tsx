import { cn } from '@/lib/utils';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { Loader2 } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

/* ---------------------------------- input --------------------------------- */

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'h-10 w-full rounded-(--radius-card) border border-line bg-surface px-3 py-2 text-sm text-ink shadow-(--shadow-card) transition-colors placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-soft disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full resize-y rounded-(--radius-card) border border-line bg-surface px-3 py-2 text-sm text-ink shadow-(--shadow-card) transition-colors placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-soft disabled:opacity-70',
        className,
      )}
      {...props}
    />
  );
}

/** Native select, kept for forms that rely on native submit/option semantics. */
export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full appearance-none rounded-(--radius-card) border border-line bg-surface px-3 text-sm text-ink shadow-(--shadow-card) transition-colors focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-soft',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/* ---------------------------------- label --------------------------------- */

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn('text-xs font-semibold uppercase tracking-wider text-muted', className)}
      {...props}
    />
  );
}

/** Form field wrapper: label + control + hint/error, used across admin forms. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('block space-y-1.5', className)}>
      {label ? (
        <Label htmlFor={htmlFor} className="flex items-center gap-1">
          {label}
          {required ? <span className="text-accent">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? (
        <span className="block text-xs text-red-700">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

/** Horizontal label/control row for settings-style forms. */
export function FormRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="sm:max-w-xs">
        <div className="text-sm font-medium text-ink">{label}</div>
        {hint ? <div className="text-xs text-muted">{hint}</div> : null}
      </div>
      <div className="sm:w-64">{children}</div>
    </div>
  );
}

/* -------------------------------- separator ------------------------------- */

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      decorative={decorative}
      orientation={orientation}
      className={cn('shrink-0 bg-line', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)}
      {...props}
    />
  );
}

/* --------------------------------- switch --------------------------------- */

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-line',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-(--shadow-card) transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

/* -------------------------------- skeleton -------------------------------- */

export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-(--radius-card) bg-soft', className)} {...props} />;
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-sm text-muted', className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      {label ?? 'Memuat…'}
    </div>
  );
}
