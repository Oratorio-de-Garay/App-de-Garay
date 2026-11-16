import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const estilos = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-brand-800 active:bg-brand-900",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        "destructive-ghost": "text-destructive hover:bg-danger-soft",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4 md:h-10",
        sm: "h-9 px-3 text-[13px]",
        lg: "h-12 px-5 text-base",
        icon: "size-11 md:size-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof estilos> {
  asChild?: boolean;
  /** Muestra un spinner y deshabilita el botón mientras corre la acción. */
  cargando?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  cargando,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      type={asChild ? undefined : "button"}
      className={cn(estilos({ variant, size }), className)}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      {...props}
    >
      {cargando ? (
        <>
          <Loader2 className="animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
