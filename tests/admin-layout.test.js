import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Admin sidebar layout (#138)', () => {
  it('AdminSidebar.tsx exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/components/AdminSidebar.tsx')),
    ).toBe(true);
  });

  it('sidebar has Modération and Utilisateurs sections', () => {
    const content = readFileSync(
      resolve(adminDir, 'src/components/AdminSidebar.tsx'),
      'utf-8',
    );
    expect(content).toContain('Modération');
    expect(content).toContain('Utilisateurs');
  });

  it('sidebar uses NavLink for collapsable menus', () => {
    const content = readFileSync(
      resolve(adminDir, 'src/components/AdminSidebar.tsx'),
      'utf-8',
    );
    expect(content).toContain('NavLink');
    expect(content).toContain('defaultOpened');
  });

  it('AdminLayout.tsx wraps with AppShell', () => {
    const content = readFileSync(
      resolve(adminDir, 'src/components/AdminLayout.tsx'),
      'utf-8',
    );
    expect(content).toContain('AppShell');
    expect(content).toContain('AdminSidebar');
  });

  it('root layout uses AdminLayout', () => {
    const layout = readFileSync(
      resolve(adminDir, 'src/app/layout.tsx'),
      'utf-8',
    );
    expect(layout).toContain('AdminLayout');
  });

  it('sidebar has navigation links to /moderation and /users', () => {
    const content = readFileSync(
      resolve(adminDir, 'src/components/AdminSidebar.tsx'),
      'utf-8',
    );
    expect(content).toContain('/moderation');
    expect(content).toContain('/users');
  });
});
