import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `New Deep Dive | ${BRAND.name}`,
};

export default function NewDeepDiveLayout({ children }: { children: React.ReactNode }) {
  return children;
}
