/**
 * One-off script to regenerate a portfolio for a given handle
 * using the new template system.
 *
 * Usage: npx tsx scripts/regenerate-portfolio.ts <handle>
 */
// Load environment variables — .env.local takes precedence
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
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// Load .env first, then .env.local overrides
loadEnvFile(path.join(process.cwd(), '.env'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 50));

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

async function main() {
  const handle = process.argv[2] || 'shobhitsrivastava';

  console.log(`Looking up profile: ${handle}`);

  const profile = await db.profile.findFirst({
    where: { handle, isArchived: false },
    select: { id: true, handle: true, firstName: true, lastName: true },
  });

  if (!profile) {
    console.error(`Profile not found for handle: ${handle}`);
    process.exit(1);
  }

  console.log(`Found profile: ${profile.firstName} ${profile.lastName} (${profile.id})`);

  // Check existing portfolio
  const existing = await db.generatedPortfolio.findFirst({
    where: {
      profileId: profile.id,
      isActive: true,
      status: { in: ['PUBLISHED', 'DRAFT'] },
    },
    select: { id: true, plan: true, version: true },
  });

  if (existing) {
    const plan = existing.plan as Record<string, unknown> | null;
    const isTemplate = plan && typeof plan.templateId === 'string';
    console.log(
      `Existing portfolio: v${existing.version}, template=${isTemplate}, id=${existing.id}`
    );
  } else {
    console.log('No existing active portfolio found');
  }

  // Dynamically import the enhanced generation service
  console.log('Generating AI-enriched portfolio...');

  const { generateEnhancedPortfolio } =
    await import('../services/portfolio/enhanced-generation.service');

  const result = await generateEnhancedPortfolio(profile.id, {
    templateId: 'developer-dark',
  });

  console.log('Generation complete!');
  console.log(`  Portfolio ID: ${result.portfolioId}`);
  console.log(`  Template: ${result.templateId}`);
  console.log(`  AI Generated: ${result.isAIGenerated}`);
  console.log(`  Time: ${result.generationTimeMs}ms`);
  console.log(`  Pipeline stages: ${result.pipelineStagesRun.join(' → ')}`);

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err);
  await db.$disconnect();
  process.exit(1);
});
