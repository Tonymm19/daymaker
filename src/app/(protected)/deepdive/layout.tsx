import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Deep Dive | ${BRAND.name}`,
  description: 'Strategic alignment analysis between you and any contact in your network.',
};

export default function DeepDiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
