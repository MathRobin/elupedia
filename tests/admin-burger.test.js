import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const layoutPath = resolve(
  root,
  'packages/admin/src/components/AdminLayout.tsx',
);
const content = readFileSync(layoutPath, 'utf-8');

describe('Burger menu mobile (#139)', () => {
  it('uses Burger component from Mantine', () => {
    expect(content).toContain('Burger');
    expect(content).toContain("from '@mantine/core'");
  });

  it('uses useDisclosure hook for toggle', () => {
    expect(content).toContain('useDisclosure');
    expect(content).toContain('toggle');
  });

  it('hides burger on desktop (hiddenFrom sm)', () => {
    expect(content).toContain('hiddenFrom="sm"');
  });

  it('collapses navbar on mobile when closed', () => {
    expect(content).toContain('collapsed');
    expect(content).toContain('mobile');
  });

  it('burger has aria-label', () => {
    expect(content).toContain('aria-label');
  });
});
