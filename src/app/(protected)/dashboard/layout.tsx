import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Dashboard | ${BRAND.name}`,
  description: `Your ${BRAND.name} network intelligence hub. Search, categorize, and query your contacts with AI.`,
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
