import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

async function main() {
  const handle = process.argv[2] || 'shobhitsrivastava';

  const portfolios = await db.generatedPortfolio.findMany({
    where: { profile: { handle } },
    select: { id: true, status: true, isActive: true, version: true, plan: true, createdAt: true },
    orderBy: { version: 'desc' },
  });

  console.log(`Portfolios for "${handle}": ${portfolios.length}`);

  for (const p of portfolios) {
    const plan = p.plan as Record<string, unknown> | null;
    console.log(
      `  v${p.version} | status=${p.status} | active=${p.isActive} | ` +
        `templateId=${plan?.templateId ?? 'none'} | ` +
        `keys=${plan ? Object.keys(plan).join(',') : 'null'} | ` +
        `created=${p.createdAt}`
    );
  }

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
