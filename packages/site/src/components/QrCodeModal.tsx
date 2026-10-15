/**
 * Modale affichant un QR code de l'URL courante, avec le logo Elupedia au
 * centre et un bouton de téléchargement en PNG.
 *
 * Ouverte uniquement par `ShareButton` (entrée « QR Code » du menu), donc
 * hydratée avec lui (`client:load` dans BaseLayout). Le QR code est dessiné
 * dans un <canvas> côté client avec `qrcode-generator` ; le PNG téléchargé est
 * l'export de ce canvas.
 *
 * Fermeture : bouton, touche Échap ou clic sur le fond. Le focus est piégé
 * dans la boîte de dialogue (`useFocusTrap`).
 */
import { useEffect, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { useFocusTrap } from '../lib/use-focus-trap.js';

/** Props fournies par ShareButton. */
type QrCodeModalProps = {
  /** URL encodée dans le QR code (l'URL de la page courante). */
  url: string;
  onClose: () => void;
};

/** Taille du canvas en pixels CSS (le canvas est carré). */
const CANVAS_SIZE = 280;
/** Largeur du logo central, en fraction de la largeur du canvas. */
const LOGO_RATIO = 0.22;
/** Marge blanche autour du logo, en pixels. */
const LOGO_PADDING = 4;
/** Rayon des coins du cartouche blanc derrière le logo, en pixels. */
const LOGO_CORNER_RADIUS = 8;
/**
 * Dépassement ajouté à chaque module noir : évite les fins liserés blancs
 * entre modules adjacents dus aux arrondis sous-pixel du canvas.
 */
const MODULE_OVERLAP = 0.5;
const LOGO_SRC = '/img/favicon-256x256.png';
const DOWNLOAD_FILENAME = 'elupedia-qrcode.png';

export default function QrCodeModal({ url, onClose }: QrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // PNG prêt à télécharger ; null tant que le logo n'est pas dessiné.
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const trapRef = useFocusTrap(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Niveau de correction « M » (15 % de modules récupérables) : suffisant
    // pour tolérer le logo qui masque le centre.
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
            cellSize + MODULE_OVERLAP,
            cellSize + MODULE_OVERLAP,
          );
        }
      }
    }

    // Cartouche blanc arrondi puis logo par-dessus, au centre.
    const logoSize = Math.round(CANVAS_SIZE * LOGO_RATIO);
    const logoOffset = Math.round((CANVAS_SIZE - logoSize) / 2);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(
      logoOffset - LOGO_PADDING,
      logoOffset - LOGO_PADDING,
      logoSize + LOGO_PADDING * 2,
      logoSize + LOGO_PADDING * 2,
      LOGO_CORNER_RADIUS,
    );
    ctx.fill();

    const logo = new Image();
    logo.onload = () => {
      ctx.drawImage(logo, logoOffset, logoOffset, logoSize, logoSize);
      setDataUrl(canvas.toDataURL('image/png'));
    };
    logo.src = LOGO_SRC;
  }, [url]);

  useEffect(() => {
    function closeOnEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  function downloadPng() {
    if (!dataUrl) return;
    const downloadLink = document.createElement('a');
    downloadLink.href = dataUrl;
    downloadLink.download = DOWNLOAD_FILENAME;
    downloadLink.click();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        // Ne ferme que sur clic du fond, pas sur un clic dans la boîte.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="QR Code de la page"
        className="relative mx-4 w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          aria-label="Fermer"
        >
          <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
        </button>

        <h3 className="mb-4 text-center text-sm font-semibold text-slate-700 dark:text-slate-200">
          Scanner pour ouvrir
        </h3>

        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`QR Code pour ${url}`}
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
            onClick={downloadPng}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
          >
            <i className="fa-solid fa-download text-sm" aria-hidden="true" />
            Télécharger
          </button>
        )}
      </div>
    </div>
  );
}
