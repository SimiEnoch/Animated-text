import { useRef, useEffect, useState, useCallback } from 'react';
import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi2';

type Preset = 'float' | 'repel' | 'magnet';
type PaletteName = 'neon' | 'dusk' | 'mono' | 'aurora';

interface Particle {
  x: number;
  y: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  size: number;
  hue: number;
  wobble: number;
}

interface PointerState {
  x: number;
  y: number;
  down: boolean;
}

const PALETTES: Record<PaletteName, string[]> = {
  neon: ['#00FFF0', '#FF2D95', '#6622FF', '#FFB86B'],
  dusk: ['#FFC857', '#59656F', '#255F85', '#F07B3F'],
  mono: ['#FFFFFF', '#B0B0B0', '#6F6F6F'],
  aurora: ['#62E3B1', '#5BC0FF', '#9B7CFF', '#FFD36E'],
};

const BLOOD_RED = '#7B0000';

export default function AnimatedTextArt(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const pointsRef = useRef<Particle[]>([]);
  const pointerRef = useRef<PointerState>({
    x: -9999,
    y: -9999,
    down: false,
  });

  const [lightOn, setLightOn] = useState(false);

  const [text, setText] = useState('Type here...');

  const [fontSize, setFontSize] = useState(() => {
    const w = window.innerWidth;

    if (w < 480) return 90;
    if (w < 768) return 140;
    return 220;
  });

  const [density, setDensity] = useState(6);
  const [scheme, setScheme] = useState<PaletteName>('neon');
  const [tweak] = useState(1);

  const [running, setRunning] = useState(true);
  const [preset, setPreset] = useState<Preset>('float');
  const [showPanel, setShowPanel] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node)
      ) {
        setShowPanel(false);
        clearHideTimer();
      }
    };
    if (showPanel)
      document.addEventListener('mousedown', handleClickOutside);
    return () =>
      document.removeEventListener('mousedown', handleClickOutside);
  }, [showPanel]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, []);

  useEffect(() => {
    offRef.current = document.createElement('canvas');
  }, []);

  const wrapTextLines = (
    octx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ) => {
    const paragraphs = text.split('\n');
    const wrapped: string[] = [];
    for (const para of paragraphs) {
      const words = para.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        wrapped.push('');
        continue;
      }
      let line = words[0];
      for (let i = 1; i < words.length; i++) {
        const test = line + ' ' + words[i];
        const w = octx.measureText(test).width;
        if (w > maxWidth && line !== '') {
          wrapped.push(line);
          line = words[i];
        } else {
          line = test;
        }
      }
      wrapped.push(line);
    }
    return wrapped;
  };

  const buildPoints = useCallback(() => {
    const canvas = canvasRef.current;
    const off = offRef.current;
    if (!canvas || !off) return;
    const ctx2d = canvas.getContext('2d');
    const octx = off.getContext('2d');
    if (!ctx2d || !octx) return;

    const dpr = window.devicePixelRatio || 1;
    let W;

    if (window.innerWidth < 1024) {
      W = canvas.clientWidth * dpr;
    } else {
      W = Math.max(800, canvas.clientWidth) * dpr;
    }

    const H = Math.max(300, canvas.clientHeight) * dpr;

    off.width = Math.round(W);
    off.height = Math.round(H);

    octx.clearRect(0, 0, W, H);

    octx.font = `bold ${Math.floor(
      fontSize * dpr
    )}px Inter, sans-serif`;
    octx.textAlign = 'center';
    octx.textBaseline = 'alphabetic';
    octx.fillStyle = BLOOD_RED;

    const maxTextWidth = Math.floor(W * 0.86);
    const lines = wrapTextLines(octx, text, maxTextWidth);

    const metricsArr = lines.map((ln) => octx.measureText(ln));
    const lineHeights = metricsArr.map((m) => {
      const ascent =
        m.actualBoundingBoxAscent ??
        Math.floor(fontSize * dpr * 0.75);
      const descent =
        m.actualBoundingBoxDescent ??
        Math.floor(fontSize * dpr * 0.25);
      return ascent + descent;
    });

    const gap = Math.round(fontSize * 0.05 * dpr);

    const blockHeight =
      lineHeights.reduce((acc, h) => acc + h, 0) +
      Math.max(0, (lines.length - 1) * gap);

    let yCursor = Math.round(H / 2 - blockHeight / 2);

    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      const m = metricsArr[i];
      const ascent =
        m.actualBoundingBoxAscent ??
        Math.floor(fontSize * dpr * 0.75);
      const jitterX = Math.sin(i * 0.7) * dpr * 2;

      const baselineY = Math.round(yCursor + ascent);

      octx.fillText(ln, W / 2 + jitterX, baselineY);

      yCursor += lineHeights[i] + gap;
    }

    const img = octx.getImageData(0, 0, W, H).data;
    const pts: Particle[] = [];
    const step = Math.max(1, density);

    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const alpha = img[(y * W + x) * 4 + 3];
        if (alpha > 50) {
          pts.push({
            x: x / dpr,
            y: y / dpr,
            ox: x / dpr,
            oy: y / dpr,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            size: Math.max(
              0.7,
              (step / dpr) * (0.8 + Math.random() * 1.4)
            ),
            hue: Math.random(),
            wobble: Math.random() * 1000,
          });
        }
      }
    }

    pointsRef.current = pts;
  }, [text, fontSize, density]);

  useEffect(() => {
    document.fonts?.ready
      .then(() => {
        buildPoints();
      })
      .catch(() => {
        buildPoints();
      });
  }, [buildPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let last = performance.now();

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, canvas.clientWidth * dpr);
      canvas.height = Math.max(1, canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildPoints();
    };

    resize();
    window.addEventListener('resize', resize);

    const step = (now: number) => {
      if (!running) return;
      const dt = Math.min(40, now - last) / 1000;
      last = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const pts = pointsRef.current;
      const mx = pointerRef.current.x;
      const my = pointerRef.current.y;

      for (let p of pts) {
        const dx = mx - p.x;
        const dy = my - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.00001;

        const influence =
          Math.exp(-dist / (40 + 80 * (1 / density))) *
          (pointerRef.current.down ? 2 : 1);

        let dir = 1;
        if (preset === 'repel') dir = -1;
        if (preset === 'magnet') dir = 2;

        p.vx += dir * (dx / dist) * influence * 0.6;
        p.vy += dir * (dy / dist) * influence * 0.6;

        p.vx += (p.ox - p.x) * 0.01 * dt * (1 + 0.8 * tweak);
        p.vy += (p.oy - p.y) * 0.01 * dt * (1 + 0.8 * tweak);

        p.vx *= 0.92;
        p.vy *= 0.92;

        p.x += p.vx * 10 * dt;
        p.y += p.vy * 10 * dt;

        const color = BLOOD_RED;

        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      window.removeEventListener('resize', resize);
      if (rafRef.current != null)
        cancelAnimationFrame(rafRef.current);
    };
  }, [running, scheme, density, tweak, preset, buildPoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      if ('touches' in e && e.touches.length) {
        return {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
      const m = e as MouseEvent;
      return { x: m.clientX - rect.left, y: m.clientY - rect.top };
    };

    const move = (e: Event) => {
      pointerRef.current = {
        ...pointerRef.current,
        ...getPos(e as any),
      };
    };

    const down = (e: Event) => {
      pointerRef.current.down = true;
      move(e);
    };

    const up = () => {
      pointerRef.current = { x: -9999, y: -9999, down: false };
    };

    const opts = { passive: true };

    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mousedown', down);
    canvas.addEventListener('touchmove', move, opts);
    canvas.addEventListener('touchstart', down, opts);

    window.addEventListener('mouseup', up);
    window.addEventListener('touchend', up);

    return () => {
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mousedown', down);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchstart', down);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchend', up);
    };
  }, []);

  useEffect(() => {
    const id = setTimeout(buildPoints, 80);
    return () => clearTimeout(id);
  }, [buildPoints]);

  return (
    <div
      className={`
  min-h-screen h-screen w-full flex flex-col overflow-hidden transition-colors duration-500
  ${lightOn ? 'bg-white text-black' : 'bg-black text-white'}

  sm:px-2 md:px-4 lg:px-0
`}
    >
      <div className="flex-1 relative overflow-hidden">
        <div
          className="
    font-bold text-center
    text-lg sm:text-base md:text-lg lg:text-xl xl:text-2xl
  "
        >
          {/* 100 days Coding Challenge - Day 1 */}
        </div>

        <button
          onClick={() => setLightOn((v) => !v)}
          className="
    fixed top-6 right-6 z-50
    w-8 h-8 rounded-full bg-black/30 backdrop-blur border border-white/30
    flex items-center justify-center transition-all hover:bg-black/50
  "
        >
          {lightOn ? (
            <HiOutlineSun className="text-yellow-300 text-xl" />
          ) : (
            <HiOutlineMoon className="text-red-500 text-xl" />
          )}
        </button>

        <button
          onClick={() => {
            setShowPanel(true);
            clearHideTimer();
          }}
          className="
    fixed left-4 z-60 cursor-pointer text-white bg-gray-500 bg-white/10 rounded-lg

    text-xs sm:text-[10px] md:text-xs
    p-1.5 sm:p-1 md:p-2
    top-4 sm:top-4 md:top-5 lg:top-6
  "
        >
          Click here to edit
        </button>

        <div
          className={`
    fixed top-4 left-4 z-50
    transition-all duration-300 ease-out
    ${
      showPanel
        ? 'opacity-100 translate-x-0'
        : 'opacity-0 -translate-x-8 pointer-events-none'
    }
  `}
        >
          <div
            ref={panelRef}
            className={`
  p-4 bg-black/70 backdrop-blur-xl border border-white/10 rounded-xl
  w-[90%] max-w-md
  transform transition-all duration-300 ease-out
  ${showPanel ? 'scale-100' : 'scale-95'}
`}
          >
            <div
              className="
        bg-white border border-gray-300 rounded-xl shadow-md
        overflow-y-auto
        p-4 sm:p-3 md:p-4 lg:p-6
        max-w-xs sm:max-w-xs md:max-w-sm lg:max-w-sm
        max-h-[calc(100vh-10rem)] sm:max-h-[calc(100vh-8rem)] lg:max-h-[calc(100vh-12rem)]
      "
            >
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Text
              </label>

              <textarea
                ref={textareaRef}
                defaultValue={text}
                onInput={(e) =>
                  setText((e.target as HTMLTextAreaElement).value)
                }
                rows={3}
                style={{ color: BLOOD_RED }}
                className="
    w-full bg-gray-50 text-gray-900 text-sm border border-gray-300 
    rounded-md p-2 outline-none resize-none overflow-hidden
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
  "
              />

              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Font size
                  </label>
                  <input
                    type="range"
                    min={40}
                    max={420}
                    value={fontSize}
                    onChange={(e) => setFontSize(+e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Density
                  </label>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    value={density}
                    onChange={(e) => setDensity(+e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>

              <div className="mt-4 flex gap-4 items-center">
                <label className="text-sm font-medium text-gray-700">
                  Palette
                </label>
                <select
                  value={scheme}
                  onChange={(e) =>
                    setScheme(e.target.value as PaletteName)
                  }
                  className="
            text-sm bg-white border border-gray-300 rounded-md p-1.5 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          "
                >
                  {Object.keys(PALETTES).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-4 flex gap-4 items-center">
                <label className="text-sm font-medium text-gray-700">
                  Preset
                </label>
                <select
                  value={preset}
                  onChange={(e) =>
                    setPreset(e.target.value as Preset)
                  }
                  className="
            text-sm bg-white border border-gray-300 rounded-md p-1.5 
            focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          "
                >
                  <option value="float">float</option>
                  <option value="repel">repel</option>
                  <option value="magnet">magnet</option>
                </select>

                <button
                  className="
            ml-auto text-sm px-4 py-1.5 rounded-md 
            bg-blue-600 text-white font-medium
            hover:bg-blue-700 transition
          "
                  onClick={() => setRunning((r) => !r)}
                >
                  {running ? 'Pause' : 'Play'}
                </button>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  className="
            text-sm px-4 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 
            text-gray-800 border border-gray-300 transition
          "
                  onClick={() => setText((t) => t + '')}
                >
                  Add sparkle
                </button>

                <button
                  className="
            text-sm px-4 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 
            text-gray-800 border border-gray-300 transition
          "
                  onClick={() => setText('Damn this dev is good')}
                >
                  Demo
                </button>

                <button
                  className="
            text-sm px-4 py-1.5 rounded-md bg-gray-100 hover:bg-gray-200 
            text-gray-800 border border-gray-300 transition
          "
                  onClick={() => {
                    setText('\n');
                    setTimeout(() => setText(''), 10);
                  }}
                >
                  Clear
                </button>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                Tip: click & drag to push particles; hold to amplify.
              </div>
            </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          className="w-full h-full pointer-events-none"
        />

        <div
          className="
    absolute
    bg-black/30 backdrop-blur-sm rounded-xl border border-white/10

    text-[10px] sm:text-[11px] md:text-xs
    px-2 py-1.5 sm:px-3 sm:py-2
    bottom-3 right-3 sm:bottom-4 sm:right-4 md:bottom-5 md:right-5 lg:bottom-6 lg:right-6
  "
        >
          <span className="!text-center block">Made By Simi</span>

          <div className="mt-1 text-[13px] text-red-500 font-bold opacity-70 text-center">
            Whatsapp: 09039446158
          </div>

          <div className="px-6 py-3 border-t border-white flex items-center gap-4 mt-2">
            <div className="text-xs opacity-80">Export:</div>

            <button
              className="text-xs px-3 py-1 rounded-lg bg-white/10 hover:bg-white/20"
              onClick={() => {
                const canvas = canvasRef.current;
                if (!canvas) return;

                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                const original = ctx.getImageData(
                  0,
                  0,
                  canvas.width,
                  canvas.height
                );

                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = lightOn ? '#FFFFFF' : '#000000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();

                const a = document.createElement('a');
                a.href = canvas.toDataURL('image/png');
                a.download = 'my-animated-text.png';
                a.click();

                ctx.putImageData(original, 0, 0);
              }}
            >
              PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
