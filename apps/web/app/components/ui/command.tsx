import { cn } from '@/lib/utils';
import { Command as CommandPrimitive } from 'cmdk';
import { Loader2, Search } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { Dialog, DialogContent, DialogTitle } from './overlay';

/**
 * shadcn-style wrappers around `cmdk`, retuned for the VELORA tokens.
 * The primitive owns keyboard handling (↑ ↓ ↵ esc, wrap-around, aria-activedescendant)
 * so screens only describe groups and items.
 */

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('flex h-full w-full flex-col overflow-hidden bg-surface text-ink', className)}
      {...props}
    />
  );
}

export function CommandDialog({
  open,
  onOpenChange,
  title,
  filter = true,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Announced to screen readers; the visual entry point is the input itself. */
  title: string;
  /** Off when results arrive pre-filtered from the server. */
  filter?: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `cn` runs tailwind-merge, so these override the centered defaults. */}
      <DialogContent className="top-[8vh] max-w-xl translate-y-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <Command loop shouldFilter={filter}>
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4" cmdk-input-wrapper="">
      <Search className="h-4 w-4 shrink-0 text-muted" />
      <CommandPrimitive.Input
        className={cn(
          'h-12 w-full bg-transparent pr-8 text-sm text-ink outline-none placeholder:text-muted disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain px-2 py-2', className)}
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      className={cn(
        'overflow-hidden py-0.5',
        '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[0.68rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-2.5 rounded-(--radius-card) px-2.5 py-2 text-sm text-ink outline-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-soft [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted data-[selected=true]:[&_svg]:text-accent',
        className,
      )}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return <CommandPrimitive.Separator className={cn('-mx-2 my-1 h-px bg-line', className)} {...props} />;
}

export function CommandShortcut({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'ml-auto shrink-0 rounded border border-line bg-canvas px-1.5 py-0.5 font-sans text-[0.65rem] font-medium text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function CommandLoading({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {children ?? 'Mencari…'}
    </div>
  );
}
