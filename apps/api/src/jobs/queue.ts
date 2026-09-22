import { PgBoss } from 'pg-boss';

export async function startQueue(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on('error', (error) => console.error('pg-boss error', error));
  await boss.start();
  return boss;
}
