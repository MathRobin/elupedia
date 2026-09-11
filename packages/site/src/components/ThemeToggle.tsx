import { useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'system';

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('theme') as Theme) ?? 'system';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    applyTheme(theme);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme('system');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  const icons: Record<Theme, string> = {
    light: 'fa-solid fa-sun',
    dark: 'fa-solid fa-moon',
    system: 'fa-solid fa-desktop',
  };

  const labels: Record<Theme, string> = {
    light: 'Clair',
    dark: 'Sombre',
    system: 'Système',
  };

  const cycle: Theme[] = ['light', 'dark', 'system'];
  const next = () => {
    const idx = cycle.indexOf(theme);
    setTheme(cycle[(idx + 1) % cycle.length]);
  };

  return (
    <button
      onClick={next}
      className="flex items-center gap-1.5 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800"
      title={`Thème : ${labels[theme]}`}
      aria-label={`Changer le thème (actuel : ${labels[theme]})`}
    >
      <i className={`${icons[theme]} text-sm`} />
    </button>
  );
}
