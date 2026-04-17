import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Event Pre-Brief | ${BRAND.name}`,
  description: 'Generate attendee briefings before your next meeting or event.',
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
