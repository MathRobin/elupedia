import { useState, useRef, useEffect } from 'react';
import QrCodeModal from './QrCodeModal';

type ShareButtonProps = {
  title: string;
  description?: string;
};

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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const url = typeof window !== 'undefined' ? window.location.href : '';

  const shareText = description ? `${title} — ${description}` : title;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  }

  const items = [
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
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-white"
        aria-label="Partager cette page"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <i className="fa-solid fa-share-nodes text-sm" aria-hidden="true" />
        Partager
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Options de partage"
          className="absolute right-0 z-50 mt-2 w-52 rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          {items.map((item) => (
            <a
              key={item.key}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 no-underline transition-colors hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-700/50"
              onClick={() => setOpen(false)}
            >
              <i
                className={`${item.faClass} shrink-0 text-slate-400 text-sm`}
                aria-hidden="true"
              />
              {item.label}
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
              setOpen(false);
              setShowQr(true);
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

      {showQr && <QrCodeModal url={url} onClose={() => setShowQr(false)} />}
    </div>
  );
}
