// shadcn/ui-style Tooltip on @radix-ui/react-tooltip, using app color tokens.
import {
  Tooltip as TooltipPrimitive,
  TooltipArrow as TooltipArrowPrimitive,
  TooltipContent as TooltipContentPrimitive,
  TooltipProvider as TooltipProviderPrimitive,
  TooltipTrigger as TooltipTriggerPrimitive,
} from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";

export const TooltipProvider = TooltipProviderPrimitive;
export const Tooltip = TooltipPrimitive;
export const TooltipTrigger = TooltipTriggerPrimitive;

export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: ComponentProps<typeof TooltipContentPrimitive>) {
  return (
    <TooltipContentPrimitive
      sideOffset={sideOffset}
      className={`z-50 rounded-md border border-border bg-bg-primary px-2.5 py-1.5 text-xs text-text-primary shadow-md ${className ?? ""}`}
      {...props}
    >
      {children}
      <TooltipArrowPrimitive className="fill-bg-primary" />
    </TooltipContentPrimitive>
  );
}
