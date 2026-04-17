import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Event Briefing | ${BRAND.name}`,
};

export default function EventDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
