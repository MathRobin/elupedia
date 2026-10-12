/**
 * Bouton de bascule du thème (clair → sombre → système, en boucle), affiché
 * dans l'en-tête de `layouts/BaseLayout.astro` avec `client:load`.
 *
 * Le choix est persisté dans `localStorage` sous la clé `theme` et appliqué
 * en posant/retirant la classe `dark` sur `<html>` (cf. `@custom-variant dark`
 * dans `styles/global.css`). BaseLayout contient un script inline qui lit la
 * même clé avant le premier rendu pour éviter un flash de thème clair : les
 * deux doivent rester cohérents (même clé, même règle pour « system »).
 */
import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

/** Clé localStorage, partagée avec le script inline de BaseLayout. */
const THEME_STORAGE_KEY = 'theme';
const DARK_SCHEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
/** Ordre de rotation au clic. */
const THEME_CYCLE: Theme[] = ['light', 'dark', 'system'];

const THEME_ICONS: Record<Theme, string> = {
  light: 'fa-solid fa-sun',
  dark: 'fa-solid fa-moon',
  system: 'fa-solid fa-desktop',
};

const THEME_LABELS: Record<Theme, string> = {
  light: 'Clair',
  dark: 'Sombre',
  system: 'Système',
};

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem(THEME_STORAGE_KEY) as Theme) ?? 'system';
}

/** Pose ou retire la classe `dark` sur <html> selon le thème demandé. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia(DARK_SCHEME_MEDIA_QUERY).matches)
  ) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export default function ThemeToggle() {
  // 'system' au rendu SSR ; la valeur stockée n'est lue qu'après montage.
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);

    // En mode « système », suivre les changements de préférence de l'OS.
    if (theme === 'system') {
      const darkSchemeQuery = window.matchMedia(DARK_SCHEME_MEDIA_QUERY);
      const followSystemScheme = () => applyTheme('system');
      darkSchemeQuery.addEventListener('change', followSystemScheme);
      return () =>
        darkSchemeQuery.removeEventListener('change', followSystemScheme);
    }
  }, [theme]);

  const cycleTheme = () => {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length]);
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800"
      title={`Thème : ${THEME_LABELS[theme]}`}
      aria-label={`Changer le thème (actuel : ${THEME_LABELS[theme]})`}
    >
      <i className={`${THEME_ICONS[theme]} text-sm`} />
    </button>
  );
}
