import { NextRequest, NextResponse } from 'next/server';
import { isHandleAvailable } from '@/services/profile.service';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const handle = searchParams.get('handle');

  if (!handle) {
    return NextResponse.json({ error: 'Handle is required' }, { status: 400 });
  }

  // Validate handle format
  if (!/^[a-z0-9-]+$/.test(handle) || handle.length < 3 || handle.length > 30) {
    return NextResponse.json({ available: false, reason: 'Invalid handle format' });
  }

  try {
    const available = await isHandleAvailable(handle);
    return NextResponse.json({ available });
  } catch (error) {
    console.error('Error checking handle:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
