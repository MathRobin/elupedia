import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Auth email magic link (#140)', () => {
  it('next-auth is a dependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['next-auth']).toBeDefined();
  });

  it('auth.ts configures Nodemailer provider', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('Nodemailer');
    expect(auth).toContain('EMAIL_SERVER');
  });

  it('auth.ts checks user exists in DB on signIn', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('signIn');
    expect(auth).toContain('users');
    expect(auth).toContain('eq(users.email');
  });

  it('auth.ts injects role into session', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('session');
    expect(auth).toContain('role');
  });

  it('NextAuth API route exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/app/api/auth/[...nextauth]/route.ts')),
    ).toBe(true);
  });

  it('login page exists with email form', () => {
    const page = readFileSync(
      resolve(adminDir, 'src/app/login/page.tsx'),
      'utf-8',
    );
    expect(page).toContain('TextInput');
    expect(page).toContain('email');
    expect(page).toContain('signIn');
  });

  it('login page handles error for unauthorized email', () => {
    const page = readFileSync(
      resolve(adminDir, 'src/app/login/page.tsx'),
      'utf-8',
    );
    expect(page).toContain('Connexion refusée');
  });
});
