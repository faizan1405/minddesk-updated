import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface LogoProps extends ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
  variant?: "squircle" | "isolated";
}

export function Logo({
  className,
  variant = "squircle",
  alt = "MindDesk",
  ...props
}: LogoProps) {
  const src = variant === "isolated" ? "/logo-isolated.png" : "/logo.png";
  return (
    <img
      src={src}
      srcSet={variant === "squircle" ? "/logo.png 1x, /logo-512.png 2x" : undefined}
      alt={alt}
      className={cn("h-7 w-7 shrink-0 select-none object-contain", className)}
      draggable={false}
      {...props}
    />
  );
}
