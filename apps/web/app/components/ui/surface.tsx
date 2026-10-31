import { cn } from '@/lib/utils';
import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';

/* ---------------------------------- card ---------------------------------- */

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 border-b border-line px-5 py-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-base font-semibold leading-none tracking-tight text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 border-t border-line px-5 py-3', className)} {...props} />;
}

/* ---------------------------------- badge --------------------------------- */

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-soft text-ink',
        accent: 'border-amber-200 bg-amber-50 text-amber-900',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        warning: 'border-orange-200 bg-orange-50 text-orange-800',
        danger: 'border-red-200 bg-red-50 text-red-800',
        outline: 'border-line bg-transparent text-muted',
        info: 'border-sky-200 bg-sky-50 text-sky-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Badge({ className, variant, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ------------------------------ empty state ------------------------------- */

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-(--radius-card) border border-dashed border-line bg-surface px-6 py-16 text-center">
      <h3 className="text-lg text-ink">{title}</h3>
      {body ? <p className="max-w-md text-sm text-muted">{body}</p> : null}
      {action}
    </div>
  );
}

/* ------------------------------ section title ----------------------------- */

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h2 className="text-2xl sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
