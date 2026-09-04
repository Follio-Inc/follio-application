import { corsEmpty, corsJson } from '@/lib/ai-connector/cors';
import { authorizationServerMetadata } from '@/lib/ai-connector/oauth-metadata';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return corsEmpty(204);
}

export async function GET() {
  return corsJson(authorizationServerMetadata());
}
