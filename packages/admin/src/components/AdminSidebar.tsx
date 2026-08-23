'use client';

import { NavLink } from '@mantine/core';
import { usePathname } from 'next/navigation';

const navItems = [
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
              active={pathname === item.href}
            />
          ))}
        </NavLink>
      ))}
    </nav>
  );
}
