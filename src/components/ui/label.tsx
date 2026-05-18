"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type LabelProps = React.ComponentProps<"label"> & {
  /** Marque visuellement le champ comme obligatoire (gras + astérisque rouge). */
  required?: boolean
}

function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        required ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium",
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span
          aria-hidden="true"
          className="text-red-600 dark:text-red-400 font-bold"
          title="Champ obligatoire"
        >
          *
        </span>
      )}
    </label>
  )
}

export { Label }
