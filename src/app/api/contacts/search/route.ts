import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { message: 'Contact search endpoint — not implemented' },
    { status: 501 }
  );
}
