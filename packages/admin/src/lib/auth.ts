import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';
import { eq } from 'drizzle-orm';
import { createDb, users } from '@elupedia/shared';

const db = createDb();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM ?? 'noreply@elupedia.fr',
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);
      return rows.length > 0;
    },
    async session({ session }) {
      if (session.user?.email) {
        const rows = await db
          .select({ role: users.role })
          .from(users)
          .where(eq(users.email, session.user.email))
          .limit(1);
        if (rows.length > 0) {
          (session as { user: { role?: string } }).user.role = rows[0].role;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
