import { hash } from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb, users } from '@elupedia/shared';

const email = 'mthrobin@gmail.com';
const password = 'KHWHXeZCsXW2y@j@0e$rb#8JVGZtV@';

if (!email || !password) {
  console.error('Usage: tsx scripts/set-password.ts <email> <password>');
  process.exit(1);
}

const db = createDb();
const passwordHash = await hash(password, 12);

const result = await db
  .update(users)
  .set({ passwordHash })
  .where(eq(users.email, email))
  .returning({ id: users.id, email: users.email });

if (result.length === 0) {
  console.error(`Aucun utilisateur trouvé avec l'email : ${email}`);
  process.exit(1);
}

console.log(`Mot de passe mis à jour pour ${result[0].email}`);
