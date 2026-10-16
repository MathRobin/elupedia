'use client';

import { NavLink } from '@mantine/core';
import { usePathname } from 'next/navigation';

const navItems = [
  {
    label: 'Élus',
    children: [
      { label: 'Rechercher', href: '/elus/recherche' },
      { label: 'Doublons', href: '/elus/doublons' },
      { label: 'Rattachements', href: '/rattachements' },
    ],
  },
  {
    label: 'Vidéos',
    children: [
      { label: 'Shorts', href: '/videos' },
      { label: 'Dérive des faits', href: '/videos/derive' },
    ],
  },
  {
    label: 'Données',
    children: [
      { label: 'Ingestions', href: '/ingestions' },
      { label: 'Cohérence', href: '/coherence' },
    ],
  },
  {
    label: 'Modération',
    children: [{ label: 'Queue de modération', href: '/moderation' }],
  },
  {
    label: 'Utilisateurs',
    children: [{ label: 'Gestion des comptes', href: '/users' }],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigation admin">
      {navItems.map((section) => (
        <NavLink key={section.label} label={section.label} defaultOpened>
          {section.children.map((item) => (
            <NavLink
              key={item.href}
              label={item.label}
              href={item.href}
              component="a"
              active={
                pathname === item.href ||
                (pathname.startsWith(`${item.href}/`) &&
                  !section.children.some(
                    (other) =>
                      other !== item && pathname.startsWith(other.href),
                  ))
              }
            />
          ))}
        </NavLink>
      ))}
    </nav>
  );
}
