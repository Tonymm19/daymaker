import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Monthly Briefing | ${BRAND.name}`,
  description: 'AI-generated summary of your most relevant contacts and opportunities this month.',
};

export default function BriefingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
