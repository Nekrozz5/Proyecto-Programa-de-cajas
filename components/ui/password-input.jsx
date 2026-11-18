"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const PasswordInput = React.forwardRef(({ className, containerClassName, toggleClassName, ...props }, ref) => {
    const [mostrar, setMostrar] = React.useState(false);

    return (
        <div className={cn("relative w-full flex items-center", containerClassName)}>
            <input
                type={mostrar ? "text" : "password"}
                data-slot="password-input"
                className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-10 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
                    className
                )}
                ref={ref}
                {...props}
            />
            <button
                type="button"
                onClick={() => setMostrar((prev) => !prev)}
                className={cn(
                    "absolute right-2.5 flex items-center justify-center text-slate-400 hover:text-slate-600 focus:text-slate-800 transition-colors p-1 rounded focus:outline-none cursor-pointer",
                    toggleClassName
                )}
                title={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-label={mostrar ? "Ocultar contraseña" : "Mostrar contraseña"}
                tabIndex={-1}
            >
                {mostrar ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                )}
            </button>
        </div>
    );
});

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
