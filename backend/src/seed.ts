import bcrypt from 'bcryptjs';
import { prisma } from './db';

export async function seedDatabase() {
  try {
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('No users found. Seeding initial admin user...');
      const adminEmail = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
      const adminPasswordRaw = process.env.DEFAULT_ADMIN_PASSWORD || 'ChangeMe123!';
      const passwordHash = await bcrypt.hash(adminPasswordRaw, 10);

      const adminUser = await prisma.user.create({
        data: {
          email: adminEmail,
          password: passwordHash,
        },
      });

      console.log(`Admin user successfully seeded: ${adminUser.email}`);
    } else {
      console.log('Database already has users. Skipping seeding.');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
