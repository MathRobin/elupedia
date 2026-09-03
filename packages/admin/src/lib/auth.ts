import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import {
  createDb,
  users,
  accounts,
  verificationTokens,
} from '@elupedia/shared';

const db = createDb();

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== 'string' || typeof password !== 'string')
          return null;

        const rows = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (rows.length === 0) return null;

        const user = rows[0];
        if (!user.passwordHash) return null;

        const valid = await compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.email) {
        const rows = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);
        if (rows.length > 0) {
          token.role = rows[0].role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.role) {
        (session as { user: { role?: string } }).user.role =
          token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
