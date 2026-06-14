import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function listDirRecursive(dir: string, depth = 0): string[] {
  if (depth > 3) return [];
  try {
    if (!fs.existsSync(dir)) return [`${dir} does not exist`];
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) return [`${dir} is not a directory`];

    const files = fs.readdirSync(dir);
    let results: string[] = [];
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const fileStat = fs.statSync(fullPath);
      if (fileStat.isDirectory()) {
        results.push(`DIR: ${fullPath}`);
        results = results.concat(listDirRecursive(fullPath, depth + 1));
      } else {
        results.push(`FILE: ${fullPath} (${fileStat.size} bytes)`);
      }
    }
    return results;
  } catch (err: any) {
    return [`Error listing ${dir}: ${err.message}`];
  }
}

export async function GET(request: NextRequest) {
  try {
    const cwd = process.cwd();
    const envKeys = Object.keys(process.env);
    
    // Safely extract non-sensitive env vars
    const safeEnv: Record<string, string> = {};
    for (const key of envKeys) {
      if (
        !key.includes('SECRET') &&
        !key.includes('PASSWORD') &&
        !key.includes('KEY') &&
        !key.includes('TOKEN') &&
        !key.includes('DATABASE') &&
        !key.includes('URL')
      ) {
        safeEnv[key] = process.env[key] || '';
      }
    }

    const filesInCwd = listDirRecursive(cwd);
    const filesInTmp = listDirRecursive('/tmp');
    const publicFiles = listDirRecursive(path.join(cwd, 'public'));

    return NextResponse.json({
      cwd,
      safeEnv,
      filesInCwd,
      filesInTmp,
      publicFiles,
      arch: process.arch,
      platform: process.platform,
      nodeVersion: process.version,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
