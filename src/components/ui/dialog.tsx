// shadcn/ui-style Dialog on Radix, using the dashboard's color tokens.
import {
  Close as DialogClosePrimitive,
  Content as DialogContentPrimitive,
  Description as DialogDescriptionPrimitive,
  Overlay as DialogOverlayPrimitive,
  Portal as DialogPortalPrimitive,
  Root as DialogRootPrimitive,
  Title as DialogTitlePrimitive,
} from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";

export const Dialog = DialogRootPrimitive;
export const DialogClose = DialogClosePrimitive;
export const DialogTitle = DialogTitlePrimitive;
export const DialogDescription = DialogDescriptionPrimitive;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogContentPrimitive>) {
  return (
    <DialogPortalPrimitive>
      <DialogOverlayPrimitive className="fixed inset-0 z-50 bg-black/60" />
      <DialogContentPrimitive
        className={`fixed left-1/2 top-1/2 z-50 flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-bg-card p-5 text-text-primary shadow-2xl focus-visible:outline-2 focus-visible:outline-accent sm:p-6 ${className ?? ""}`}
        {...props}
      >
        {children}
        <DialogClosePrimitive
          aria-label="Close chart picker"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="size-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </DialogClosePrimitive>
      </DialogContentPrimitive>
    </DialogPortalPrimitive>
  );
}
