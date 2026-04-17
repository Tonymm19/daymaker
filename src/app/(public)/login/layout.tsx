import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Sign In | ${BRAND.name}`,
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
