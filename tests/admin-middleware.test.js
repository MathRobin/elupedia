import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
// Next 16 : le fichier `middleware.ts` est devenu `proxy.ts` (même rôle).
const middlewarePath = resolve(root, 'packages/admin/src/proxy.ts');

describe('Admin route protection proxy (#141)', () => {
  it('proxy.ts exists', () => {
    expect(existsSync(middlewarePath)).toBe(true);
  });

  const content = readFileSync(middlewarePath, 'utf-8');

  it('redirects unauthenticated users to /login', () => {
    expect(content).toContain('/login');
    expect(content).toContain('NextResponse.redirect');
  });

  it('allows /login and /api/auth routes without auth', () => {
    expect(content).toContain("'/login'");
    expect(content).toContain("'/api/auth'");
    expect(content).toContain('isPublicRoute');
  });

  it('uses auth from next-auth', () => {
    expect(content).toContain("from '@/lib/auth'");
    expect(content).toContain('req.auth');
  });

  it('has a matcher excluding static assets', () => {
    expect(content).toContain('matcher');
    expect(content).toContain('_next/static');
  });
});
