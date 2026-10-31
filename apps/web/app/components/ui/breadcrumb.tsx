import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { ChevronRight } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export function Breadcrumb({ className, ...props }: ComponentProps<'nav'>) {
  return <nav aria-label="Breadcrumb" className={cn('text-xs', className)} {...props} />;
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return <ol className={cn('flex flex-wrap items-center gap-1.5 text-muted', className)} {...props} />;
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

export function BreadcrumbLink({
  className,
  asChild,
  children,
  ...props
}: ComponentProps<'a'> & { asChild?: boolean; children: ReactNode }) {
  const Comp = asChild ? Slot : 'a';
  return (
    <Comp className={cn('transition-colors hover:text-ink', className)} {...props}>
      {children}
    </Comp>
  );
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return <span aria-current="page" className={cn('text-ink', className)} {...props} />;
}

export function BreadcrumbSeparator({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span role="presentation" aria-hidden="true" className={cn('text-line', className)}>
      {children ?? <ChevronRight className="h-3 w-3" />}
    </span>
  );
}
