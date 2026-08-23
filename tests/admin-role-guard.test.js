import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Role guard for user management (#142)', () => {
  it('RequireRole.tsx exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/components/RequireRole.tsx')),
    ).toBe(true);
  });

  const content = readFileSync(
    resolve(adminDir, 'src/components/RequireRole.tsx'),
    'utf-8',
  );

  it('uses useSession from next-auth', () => {
    expect(content).toContain('useSession');
    expect(content).toContain("from 'next-auth/react'");
  });

  it('checks user role against required role', () => {
    expect(content).toContain('userRole !== role');
  });

  it('shows access denied message for unauthorized role', () => {
    expect(content).toContain('Accès refusé');
  });

  it('shows loading state', () => {
    expect(content).toContain('Loader');
    expect(content).toContain("status === 'loading'");
  });

  it('providers include SessionProvider', () => {
    const providers = readFileSync(
      resolve(adminDir, 'src/app/providers.tsx'),
      'utf-8',
    );
    expect(providers).toContain('SessionProvider');
  });
});
