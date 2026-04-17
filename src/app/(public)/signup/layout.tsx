import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Sign Up | ${BRAND.name}`,
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
