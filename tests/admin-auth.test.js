import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('Auth email/password (#140)', () => {
  it('next-auth is a dependency', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(adminDir, 'package.json'), 'utf-8'),
    );
    expect(pkg.dependencies['next-auth']).toBeDefined();
  });

  it('auth.ts configures Credentials provider', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('Credentials');
    expect(auth).toContain('authorize');
  });

  it('auth.ts verifies password with bcrypt', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('compare');
    expect(auth).toContain('passwordHash');
  });

  it('auth.ts checks user exists in DB', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('users');
    expect(auth).toContain('eq(users.email');
  });

  it('auth.ts injects role into session via JWT', () => {
    const auth = readFileSync(resolve(adminDir, 'src/lib/auth.ts'), 'utf-8');
    expect(auth).toContain('jwt');
    expect(auth).toContain('role');
  });

  it('NextAuth API route exists', () => {
    expect(
      existsSync(resolve(adminDir, 'src/app/api/auth/[...nextauth]/route.ts')),
    ).toBe(true);
  });

  it('login page has email and password fields', () => {
    const page = readFileSync(
      resolve(adminDir, 'src/app/login/page.tsx'),
      'utf-8',
    );
    expect(page).toContain('TextInput');
    expect(page).toContain('PasswordInput');
    expect(page).toContain('signIn');
  });

  it('login page handles incorrect credentials error', () => {
    const page = readFileSync(
      resolve(adminDir, 'src/app/login/page.tsx'),
      'utf-8',
    );
    expect(page).toContain('incorrect');
  });
});
