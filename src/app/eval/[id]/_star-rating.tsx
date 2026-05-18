"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  required?: boolean;
  defaultValue?: number;
};

export function StarRating({ name, required, defaultValue = 0 }: Props) {
  const [value, setValue] = useState(defaultValue);
  const [hover, setHover] = useState(0);

  const display = hover || value;

  return (
    <div className="inline-flex items-center gap-1">
      <input type="hidden" name={name} value={value} required={required} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setValue(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          className="p-0.5 transition-transform hover:scale-110"
          title={`${n} étoile${n > 1 ? "s" : ""}`}
        >
          <Star
            className={cn(
              "h-7 w-7 transition-colors",
              n <= display
                ? "text-amber-400 fill-amber-400"
                : "text-zinc-200",
            )}
          />
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-sm font-bold text-amber-600 tabular-nums">
          {value}/5
        </span>
      )}
    </div>
  );
}
