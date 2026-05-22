"use client";

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignaturePadHandle = {
  /** Renvoie l'image PNG (data URL) ou null si la zone est vide. */
  getDataURL: () => string | null;
  /** Efface la zone de signature. */
  clear: () => void;
  /** True si l'utilisateur a tracé quelque chose. */
  isEmpty: () => boolean;
};

type Props = {
  /** Largeur en pixels CSS. Défaut : 320. Ignoré si `responsive` est activé. */
  width?: number;
  /** Hauteur en pixels CSS. Défaut : 140. */
  height?: number;
  /** Couleur du tracé. Défaut : noir. */
  strokeColor?: string;
  /** Épaisseur du tracé. Défaut : 2. */
  strokeWidth?: number;
  /** Callback appelé après chaque modification (utile pour activer un bouton "Valider"). */
  onChange?: (isEmpty: boolean) => void;
  className?: string;
  /**
   * Si activé, la largeur s'adapte à la largeur du conteneur (mobile-first).
   * Bornée par `maxWidth` (défaut 360px).
   */
  responsive?: boolean;
  /** Largeur max en mode responsive. Défaut : 360. */
  maxWidth?: number;
};

/**
 * Zone de signature manuscrite dessinée à la souris ou au doigt.
 * Utilise un canvas HTML5 et expose une ref pour récupérer l'image
 * PNG ou effacer la zone.
 *
 * Usage :
 * ```tsx
 * const ref = useRef<SignaturePadHandle>(null);
 * <SignaturePad ref={ref} />
 * <Button onClick={() => console.log(ref.current?.getDataURL())} />
 * ```
 */
export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  function SignaturePad(
    {
      width = 320,
      height = 140,
      strokeColor = "#18181b",
      strokeWidth = 2,
      onChange,
      className,
      responsive = false,
      maxWidth = 360,
    },
    ref,
  ) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);
    // En mode responsive, la largeur est mesurée et bornée par maxWidth.
    const [measuredWidth, setMeasuredWidth] = useState<number>(width);

    // Observe la largeur du conteneur en mode responsive.
    useEffect(() => {
      if (!responsive) {
        setMeasuredWidth(width);
        return;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const update = () => {
        const available = wrapper.clientWidth;
        const next = Math.min(maxWidth, Math.max(220, available));
        setMeasuredWidth(next);
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(wrapper);
      return () => ro.disconnect();
    }, [responsive, maxWidth, width]);

    const effectiveWidth = responsive ? measuredWidth : width;

    // Mise à l'échelle pour les écrans haute densité (rétina, mobile).
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = effectiveWidth * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${effectiveWidth}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
      }
    }, [effectiveWidth, height, strokeColor, strokeWidth]);

    function getCoords(
      e: React.PointerEvent<HTMLCanvasElement>,
    ): { x: number; y: number } {
      const rect = e.currentTarget.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastPointRef.current = getCoords(e);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
      if (!drawingRef.current) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const point = getCoords(e);
      const last = lastPointRef.current;
      if (last) {
        ctx.beginPath();
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      lastPointRef.current = point;
      if (isEmpty) {
        setIsEmpty(false);
        onChange?.(false);
      }
    }

    function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
      drawingRef.current = false;
      lastPointRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignoré : releasePointerCapture peut throw si déjà relâché
      }
    }

    function clear() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setIsEmpty(true);
      onChange?.(true);
    }

    useImperativeHandle(ref, () => ({
      getDataURL: () => {
        const canvas = canvasRef.current;
        if (!canvas || isEmpty) return null;
        return canvas.toDataURL("image/png");
      },
      clear,
      isEmpty: () => isEmpty,
    }));

    return (
      <div
        ref={wrapperRef}
        className={cn(
          responsive
            ? "flex flex-col items-stretch gap-2 w-full"
            : "inline-flex flex-col items-stretch gap-2",
          className,
        )}
      >
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="rounded-md border-2 border-dashed border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-50 cursor-crosshair touch-none"
          />
          {isEmpty && (
            <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 italic pointer-events-none select-none">
              Signez ici (souris ou doigt)
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Eraser className="h-3.5 w-3.5" />
          Effacer
        </button>
      </div>
    );
  },
);
