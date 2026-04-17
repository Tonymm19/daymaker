import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Get Started | ${BRAND.name}`,
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
