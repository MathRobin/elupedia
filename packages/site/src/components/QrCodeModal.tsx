import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';

type QrCodeModalProps = {
  url: string;
  onClose: () => void;
};

const CANVAS_SIZE = 280;
const LOGO_RATIO = 0.22;

export default function QrCodeModal({ url, onClose }: QrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const moduleCount = qr.getModuleCount();
    const cellSize = CANVAS_SIZE / moduleCount;

    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    ctx.fillStyle = '#000000';
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            col * cellSize,
            row * cellSize,
            cellSize + 0.5,
            cellSize + 0.5,
          );
        }
      }
    }

    const logoSize = Math.round(CANVAS_SIZE * LOGO_RATIO);
    const logoOffset = Math.round((CANVAS_SIZE - logoSize) / 2);
    const padding = 4;

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(
      logoOffset - padding,
      logoOffset - padding,
      logoSize + padding * 2,
      logoSize + padding * 2,
      8,
    );
    ctx.fill();

    const logo = new Image();
    logo.onload = () => {
      ctx.drawImage(logo, logoOffset, logoOffset, logoSize, logoSize);
      setDataUrl(canvas.toDataURL('image/png'));
    };
    logo.src = '/img/logo-256x256.png';
  }, [url]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative mx-4 w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Fermer"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h3 className="mb-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
          Scanner pour ouvrir
        </h3>

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-xl"
            style={{
              width: CANVAS_SIZE,
              height: CANVAS_SIZE,
              imageRendering: 'pixelated',
            }}
          />
        </div>

        <p className="mt-3 truncate text-center text-xs text-slate-400 dark:text-slate-500">
          {url}
        </p>

        {dataUrl && (
          <button
            onClick={() => {
              const a = document.createElement('a');
              a.href = dataUrl;
              a.download = 'elupedia-qrcode.png';
              a.click();
            }}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Télécharger
          </button>
        )}
      </div>
    </div>
  );
}
