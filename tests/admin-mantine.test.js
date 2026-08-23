import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Mantine integration (#137)', () => {
  it('@mantine/core is a dependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['@mantine/core']).toBeDefined();
  });

  it('@mantine/hooks is a dependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['@mantine/hooks']).toBeDefined();
  });

  it('layout imports Mantine styles and provider', () => {
    const layout = readFileSync(
      resolve(adminDir, 'src/app/layout.tsx'),
      'utf-8',
    );
    expect(layout).toContain('@mantine/core/styles.css');
    expect(layout).toContain('Providers');
    expect(layout).toContain('ColorSchemeScript');
  });

  it('providers.tsx wraps with MantineProvider', () => {
    const providers = readFileSync(
      resolve(adminDir, 'src/app/providers.tsx'),
      'utf-8',
    );
    expect(providers).toContain('MantineProvider');
    expect(providers).toContain('theme');
  });

  it('theme.ts defines a custom theme', () => {
    const theme = readFileSync(resolve(adminDir, 'src/app/theme.ts'), 'utf-8');
    expect(theme).toContain('createTheme');
    expect(theme).toContain('primaryColor');
  });

  it('page uses Mantine components', () => {
    const page = readFileSync(resolve(adminDir, 'src/app/page.tsx'), 'utf-8');
    expect(page).toContain("from '@mantine/core'");
  });
});
