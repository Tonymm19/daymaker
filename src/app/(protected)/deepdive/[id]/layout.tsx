import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Deep Dive Details | ${BRAND.name}`,
};

export default function DeepDiveDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
