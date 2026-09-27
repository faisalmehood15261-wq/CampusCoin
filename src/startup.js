import bcrypt from 'bcrypt';
import { connectDatabase } from './config/db.js';
import { Category, DEFAULT_CATEGORIES, User } from './models/index.js';

let pending = null;

async function seedDefaultCategories() {
  if (await Category.countDocuments({ isDefault: true })) return;
  await Category.insertMany(
    DEFAULT_CATEGORIES.map(([name, type, icon]) => ({ name, type, icon, isDefault: true }))
  );
  console.info('Default categories seeded');
}

// Creates the administrator only when the configured email is missing.
// An existing account keeps its current password so restarts never lock anyone out.
export async function ensureAdminAccount() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    console.warn('ADMIN_EMAIL/ADMIN_PASSWORD not set - skipping admin provisioning');
    return null;
  }

  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.info(`Promoted ${email} to administrator`);
    }
    return existing;
  }

  const admin = await User.create({
    name: 'Campus Coin Admin',
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: 'admin',
    authProvider: 'local',
    isActive: true
  });

  console.info(`Administrator provisioned for ${email}`);
  return admin;
}

export async function prepareDatabase() {
  if (!pending) {
    pending = (async () => {
      await connectDatabase();
      await seedDefaultCategories();
    })().catch((error) => {
      pending = null; // allow a retry on the next request or cold start
      throw error;
    });
  }
  return pending;
}

// Connects lazily so serverless cold starts wait for MongoDB before touching models.
export async function databaseGate(_req, _res, next) {
  try {
    await prepareDatabase();
    next();
  } catch (error) {
    next(error);
  }
}
