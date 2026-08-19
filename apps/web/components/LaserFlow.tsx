"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight LaserFlow-style ambient effect (inspired by reactbits.dev/animations/laser-flow).
 * 2D canvas beams + fog + mouse tilt — no Three.js, dashboard-safe performance.
 */
export default function LaserFlow() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let t = 0;

    const mouse = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };

    const beams = [
      { x: 0.22, hue: 210, speed: 0.35, width: 0.09 },
      { x: 0.5, hue: 265, speed: 0.28, width: 0.07 },
      { x: 0.78, hue: 185, speed: 0.42, width: 0.08 },
    ];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onMove(e: PointerEvent) {
      mouse.tx = e.clientX / w;
      mouse.ty = e.clientY / h;
    }

    function onLeave() {
      mouse.tx = 0.5;
      mouse.ty = 0.4;
    }

    function frame(now: number) {
      t = now * 0.001;
      mouse.x += (mouse.tx - mouse.x) * 0.06;
      mouse.y += (mouse.ty - mouse.y) * 0.06;

      ctx!.clearRect(0, 0, w, h);

      // Soft fog wash
      const fog = ctx!.createRadialGradient(
        w * mouse.x,
        h * 0.15,
        0,
        w * mouse.x,
        h * 0.4,
        h * 0.9
      );
      fog.addColorStop(0, "rgba(91, 140, 255, 0.07)");
      fog.addColorStop(0.45, "rgba(139, 124, 246, 0.04)");
      fog.addColorStop(1, "transparent");
      ctx!.fillStyle = fog;
      ctx!.fillRect(0, 0, w, h);

      const tilt = (mouse.x - 0.5) * 80;

      for (const b of beams) {
        const bx = w * b.x + tilt * (b.x - 0.5) * 0.6 + Math.sin(t * b.speed) * 18;
        const flow = ((t * b.speed * 40) % (h + 200)) - 100;

        // Beam core
        const grad = ctx!.createLinearGradient(bx, 0, bx, h);
        grad.addColorStop(0, `hsla(${b.hue}, 90%, 65%, 0)`);
        grad.addColorStop(0.15, `hsla(${b.hue}, 95%, 70%, 0.55)`);
        grad.addColorStop(0.45, `hsla(${b.hue + 20}, 90%, 65%, 0.35)`);
        grad.addColorStop(0.75, `hsla(${b.hue}, 85%, 60%, 0.18)`);
        grad.addColorStop(1, `hsla(${b.hue}, 80%, 55%, 0)`);

        const bw = w * b.width;
        ctx!.save();
        ctx!.translate(bx + (mouse.x - 0.5) * 30, 0);
        ctx!.transform(1, 0, (mouse.x - 0.5) * 0.08, 1, 0, 0);

        // Outer glow
        ctx!.globalCompositeOperation = "screen";
        ctx!.filter = "blur(18px)";
        ctx!.fillStyle = grad;
        ctx!.fillRect(-bw * 1.8, 0, bw * 3.6, h);

        // Sharp core
        ctx!.filter = "blur(2px)";
        ctx!.fillStyle = grad;
        ctx!.fillRect(-bw * 0.35, 0, bw * 0.7, h);

        // Traveling wisp
        const wispY = (flow + h * 0.3) % h;
        const wisp = ctx!.createRadialGradient(0, wispY, 0, 0, wispY, bw * 2.5);
        wisp.addColorStop(0, `hsla(${b.hue}, 100%, 85%, 0.7)`);
        wisp.addColorStop(0.4, `hsla(${b.hue}, 90%, 65%, 0.25)`);
        wisp.addColorStop(1, "transparent");
        ctx!.filter = "blur(8px)";
        ctx!.fillStyle = wisp;
        ctx!.fillRect(-bw * 2, wispY - bw * 3, bw * 4, bw * 6);

        ctx!.restore();
      }

      // Horizontal scan lines (subtle laser floor)
      ctx!.globalCompositeOperation = "screen";
      ctx!.filter = "none";
      for (let i = 0; i < 3; i++) {
        const y = h * (0.55 + i * 0.12) + Math.sin(t * 0.8 + i) * 12 + (mouse.y - 0.5) * 40;
        const lg = ctx!.createLinearGradient(0, y, w, y);
        lg.addColorStop(0, "transparent");
        lg.addColorStop(0.3, `rgba(91, 140, 255, ${0.06 + i * 0.02})`);
        lg.addColorStop(0.5, `rgba(34, 211, 238, ${0.1 - i * 0.02})`);
        lg.addColorStop(0.7, `rgba(139, 124, 246, ${0.06 + i * 0.02})`);
        lg.addColorStop(1, "transparent");
        ctx!.strokeStyle = lg;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }

      ctx!.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="laser-flow"
      aria-hidden
    />
  );
}
