import type { ReactNode } from 'react';
import { type ButtonProps, Button as ShadButton } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/overlay';

/**
 * VELORA UI barrel.
 *
 * The primitives live in `./ui/*` (shadcn-style); this module keeps the
 * historical `components/ui` import surface stable for the storefront while
 * mapping the older prop names (`primary`/`danger`, `md`) onto the new
 * variant vocabulary.
 */

export * from './ui/button';
export * from './ui/form';
export * from './ui/surface';
export * from './ui/overlay';

/** Back-compat wrapper: accepts both the old and the new button variants. */
export function Button({
  variant,
  size,
  ...props
}: Omit<ButtonProps, 'variant' | 'size'> & {
  variant?: ButtonProps['variant'] | 'primary' | 'danger';
  size?: ButtonProps['size'] | 'md';
}) {
  const mappedVariant = variant === 'primary' ? 'default' : variant === 'danger' ? 'destructive' : variant;
  const mappedSize = size === 'md' ? 'default' : size;
  return <ShadButton variant={mappedVariant} size={mappedSize} {...props} />;
}

/** Dialog wrapper used by quick admin actions (inventory adjustments, notes). */
export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  description,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  description?: string;
  footer?: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent wide={wide} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="px-5 py-4">{children}</div>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export { DialogClose };
