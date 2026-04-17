import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Auth session endpoint — not implemented' },
    { status: 501 }
  );
}
