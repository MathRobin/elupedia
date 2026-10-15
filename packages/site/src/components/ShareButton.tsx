/**
 * Bouton « Partager » avec menu déroulant : email, Facebook, X, copie du
 * lien et QR code (voir `QrCodeModal`).
 *
 * Rendu en haut de chaque page par `layouts/BaseLayout.astro` (sauf
 * `hideShare`) avec `client:load` : le menu et le presse-papiers exigent du
 * JavaScript, et le bouton est visible dès le chargement.
 *
 * L'URL partagée est `window.location.href` lue au rendu : au SSR elle vaut
 * '' et les liens sont complétés après hydratation. `buildShareUrl` est
 * exporté pour les tests unitaires (`ShareButton.test.ts`).
 */
import { useState, useRef, useEffect } from 'react';
import QrCodeModal from './QrCodeModal';

/** Props fournies par BaseLayout (titre et description de la page). */
type ShareButtonProps = {
  title: string;
  description?: string;
};

/** Durée d'affichage du retour « Lien copié ! » avant retour à la normale. */
const COPIED_FEEDBACK_MS = 2000;

/**
 * Construit l'URL de partage d'une plateforme (`email`, `facebook`, `x`).
 * Retourne `#` pour une plateforme inconnue.
 */
function buildShareUrl(platform: string, url: string, title: string): string {
  const encoded = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  switch (platform) {
    case 'email':
      return `mailto:?subject=${encodedTitle}&body=${encodedTitle}%0A${encoded}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encoded}`;
    case 'x':
      return `https://x.com/intent/tweet?url=${encoded}&text=${encodedTitle}`;
    default:
      return '#';
  }
}

export { buildShareUrl };

export default function ShareButton({ title, description }: ShareButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  // Ferme le menu sur clic en dehors du bouton et de sa liste.
  useEffect(() => {
    function closeMenuOnOutsideClick(e: MouseEvent) {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', closeMenuOnOutsideClick);
    return () =>
      document.removeEventListener('mousedown', closeMenuOnOutsideClick);
  }, []);

  const url = typeof window !== 'undefined' ? window.location.href : '';

  const shareText = description ? `${title} — ${description}` : title;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      /* Presse-papiers indisponible (contexte non sécurisé, refus) : on ignore. */
    }
  }

  const shareTargets = [
    {
      key: 'email',
      label: 'Email',
      faClass: 'fa-solid fa-envelope',
      href: buildShareUrl('email', url, shareText),
      external: false,
    },
    {
      key: 'facebook',
      label: 'Facebook',
      faClass: 'fa-brands fa-facebook',
      href: buildShareUrl('facebook', url, shareText),
      external: true,
    },
    {
      key: 'x',
      label: 'X (Twitter)',
      faClass: 'fa-brands fa-x-twitter',
      href: buildShareUrl('x', url, shareText),
      external: true,
    },
  ];

  return (
    <div ref={menuContainerRef} className="relative inline-block">
      <button
        onClick={() => setMenuOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
        aria-label="Partager cette page"
        aria-expanded={menuOpen}
        aria-haspopup="true"
      >
        <i className="fa-solid fa-share-nodes text-sm" aria-hidden="true" />
        Partager
      </button>

      {menuOpen && (
        <div
          role="menu"
          aria-label="Options de partage"
          className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {shareTargets.map((target) => (
            <a
              key={target.key}
              href={target.href}
              target={target.external ? '_blank' : undefined}
              rel={target.external ? 'noopener noreferrer' : undefined}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 no-underline transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
              onClick={() => setMenuOpen(false)}
            >
              <i
                className={`${target.faClass} shrink-0 text-slate-400 text-sm`}
                aria-hidden="true"
              />
              {target.label}
            </a>
          ))}
          <button
            role="menuitem"
            onClick={copyLink}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            <i
              className={`fa-solid ${copied ? 'fa-check' : 'fa-link'} shrink-0 text-slate-400 text-sm`}
              aria-hidden="true"
            />
            {copied ? 'Lien copié !' : 'Copier le lien'}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setQrModalOpen(true);
            }}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            <i
              className="fa-solid fa-qrcode shrink-0 text-slate-400 text-sm"
              aria-hidden="true"
            />
            QR Code
          </button>
        </div>
      )}

      {qrModalOpen && (
        <QrCodeModal url={url} onClose={() => setQrModalOpen(false)} />
      )}
    </div>
  );
}
