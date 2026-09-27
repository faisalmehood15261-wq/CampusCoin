import 'dotenv/config';
import { ensureAdminAccount, prepareDatabase } from '../src/startup.js';

try {
  await prepareDatabase();
  const admin = await ensureAdminAccount();

  if (!admin) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in server/.env first.');
    process.exit(1);
  }

  console.info(`Administrator ready: ${admin.email}`);
} catch (error) {
  console.error(`Unable to provision administrator: ${error.message}`);
  process.exit(1);
}
