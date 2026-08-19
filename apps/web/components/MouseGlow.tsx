"use client";

import { useEffect, useRef } from "react";

/** Soft spotlight + short particle trail that follows the cursor. */
export default function MouseGlow() {
  const spotRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const spot = spotRef.current;
    const canvas = canvasRef.current;
    if (!spot || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let mx = -999;
    let my = -999;
    let smx = -999;
    let smy = -999;

    type P = { x: number; y: number; vx: number; vy: number; life: number; hue: number };
    const particles: P[] = [];

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
      mx = e.clientX;
      my = e.clientY;
      for (let i = 0; i < 2; i++) {
        if (particles.length > 60) break;
        particles.push({
          x: mx,
          y: my,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2 - 0.3,
          life: 1,
          hue: 200 + Math.random() * 80,
        });
      }
    }

    function frame() {
      smx += (mx - smx) * 0.12;
      smy += (my - smy) * 0.12;

      spot!.style.transform = `translate(${smx}px, ${smy}px) translate(-50%, -50%)`;

      ctx!.clearRect(0, 0, w, h);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, 1.5 + p.life * 2, 0, Math.PI * 2);
        ctx!.fillStyle = `hsla(${p.hue}, 90%, 70%, ${p.life * 0.45})`;
        ctx!.fill();
      }

      raf = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      <div ref={spotRef} className="mouse-glow" aria-hidden />
      <canvas ref={canvasRef} className="mouse-particles" aria-hidden />
    </>
  );
}
