"use client";

import { useEffect, useRef } from "react";
import { WorldRuntime } from "@/lib/world/runtime";

export default function WorldCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;

    if (!container || !canvas) {
      return;
    }

    const runtime = new WorldRuntime(canvas);
    runtime.start();

    const syncSize = () => {
      runtime.resize(
        container.clientWidth,
        container.clientHeight,
        window.devicePixelRatio || 1,
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      syncSize();
    });

    resizeObserver.observe(container);
    window.addEventListener("resize", syncSize);
    syncSize();

    return () => {
      window.removeEventListener("resize", syncSize);
      resizeObserver.disconnect();
      runtime.destroy();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab touch-none select-none"
        aria-label="Zoomable and pannable world canvas"
      />
    </div>
  );
}
