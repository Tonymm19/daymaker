import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Account Action | ${BRAND.name}`,
};

export default function AuthActionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
