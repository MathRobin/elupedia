import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const adminDir = resolve(root, 'packages/admin');

describe('User management page (#143)', () => {
  it('users page exists', () => {
    expect(existsSync(resolve(adminDir, 'src/app/users/page.tsx'))).toBe(true);
  });

  it('users actions file exists', () => {
    expect(existsSync(resolve(adminDir, 'src/app/users/actions.ts'))).toBe(
      true,
    );
  });

  const page = readFileSync(
    resolve(adminDir, 'src/app/users/page.tsx'),
    'utf-8',
  );
  const actions = readFileSync(
    resolve(adminDir, 'src/app/users/actions.ts'),
    'utf-8',
  );

  it('page is wrapped with RequireRole admin', () => {
    expect(page).toContain('RequireRole');
    expect(page).toContain('role="admin"');
  });

  it('page lists users in a table', () => {
    expect(page).toContain('Table');
    expect(page).toContain('u.email');
    expect(page).toContain('u.role');
  });

  it('page has invite form', () => {
    expect(page).toContain('Inviter');
    expect(page).toContain('inviteUser');
  });

  it('page allows role change', () => {
    expect(page).toContain('handleRoleChange');
    expect(page).toContain('updateUserRole');
  });

  it('page allows user deletion', () => {
    expect(page).toContain('handleDelete');
    expect(page).toContain('deleteUser');
  });

  it('actions require admin role', () => {
    expect(actions).toContain('requireAdmin');
    expect(actions).toContain("role !== 'admin'");
  });

  it('actions validate role input', () => {
    expect(actions).toContain('Invalid role');
  });
});
