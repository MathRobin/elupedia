/**
 * Hook React de piège à focus pour les tiroirs et modales (`*Drawer.tsx`,
 * `QrCodeModal`, listes avec panneau de filtres). Tant que `active` est vrai :
 * le focus est placé sur le premier élément focalisable du conteneur, Tab et
 * Maj+Tab bouclent à l'intérieur, et à la désactivation le focus revient à
 * l'élément qui l'avait avant l'ouverture (exigence RGAA).
 *
 * Usage : `const ref = useFocusTrap(open); <div ref={ref}>…</div>`.
 * Ne gère pas Échap : c'est au composant de fermer.
 */
import { useEffect, useRef } from 'react';

/** Sélecteur des éléments atteignables au clavier (sans ceux retirés du tab order). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Renvoie la ref à poser sur le conteneur à piéger. */
export function useFocusTrap(active: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    const first = container.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;

      // Requêté à chaque Tab : le contenu du tiroir peut changer après l'ouverture.
      const focusable = container!.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstEl) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [active]);

  return containerRef;
}
