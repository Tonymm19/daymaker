import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Settings | ${BRAND.name}`,
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
