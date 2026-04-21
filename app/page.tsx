import WorldCanvas from "@/app/components/world-canvas";

export default function Home() {
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <WorldCanvas />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-4 p-4 sm:p-6">
        <section className="max-w-md rounded-3xl border border-white/12 bg-slate-950/55 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.35em] text-amber-200/85">
            Townhall Prototype
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            World Canvas
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-200/80 sm:text-base">
            A client-only 3,840 by 3,840 world with 64 pixel tiles,
            cursor-anchored zoom, clamped camera bounds, and visible-cell
            rendering.
          </p>
        </section>

        <section className="flex flex-wrap gap-3 text-xs text-slate-100/80 sm:text-sm">
          <div className="rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 backdrop-blur-md">
            Drag to pan
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 backdrop-blur-md">
            Wheel to zoom at cursor
          </div>
          <div className="rounded-full border border-white/10 bg-slate-950/45 px-4 py-2 backdrop-blur-md">
            Camera stays inside world bounds
          </div>
        </section>
      </div>
    </main>
  );
}
