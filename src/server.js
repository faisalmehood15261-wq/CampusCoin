import 'dotenv/config';
import app from './app.js';
import { ensureAdminAccount, prepareDatabase } from './startup.js';

const port = Number(process.env.PORT) || 5000;

try {
  await prepareDatabase();
  await ensureAdminAccount();
  app.listen(port, '0.0.0.0', () => console.info(`Campus Coin API listening on port ${port}`));
} catch (error) {
  console.error(`Unable to start Campus Coin API: ${error.message}`);
  process.exit(1);
}

export default app;
