/**
 * DAYMAKER CONNECT — Brand Configuration
 * 
 * Single source of truth for all product naming and branding.
 * This file exists because the product name "Daymaker Connect" is pending
 * final branding approval with stakeholder Tonya Long.
 * 
 * NEVER hardcode brand strings elsewhere — always import from here.
 */

export const BRAND = {
  // Product naming
  name: 'Daymaker Connect',
  nameShort: 'Daymaker',
  tagline: 'AI-Powered Network Intelligence',
  description: 'Transform your LinkedIn connections into actionable relationship intelligence.',
  
  // Domain & URLs
  domain: 'daymakerconnect.com',
  url: 'https://daymakerconnect.com',
  
  // Company
  company: 'Ignitia-AI',
  companyUrl: 'https://ignitia-ai.com',
  
  // Pricing
  proPriceMonthly: 29,
  proPriceCurrency: 'USD',
  
  // Plan names
  plans: {
    free: {
      name: 'Free',
      queryLimit: 10,       // per month
      contactLimit: 500,
    },
    pro: {
      name: 'Pro',
      queryLimit: Infinity,
      contactLimit: Infinity,
    },
  },
  
  // AI agent persona
  agentName: 'Daymaker Agent',
  agentGreeting: "I'm your Daymaker network intelligence agent. Ask me anything about your professional network.",
  
  // External links
  linkedInExportUrl: 'https://www.linkedin.com/mypreferences/d/download-my-data',
  
  // Integration partners
  partners: {
    reflectionsMatch: {
      name: 'Reflections Match',
      url: 'https://reflectionsmatch.com',
      description: 'Digital Twin & Persona Platform',
    },
    matchwise: {
      name: 'Matchwise',
      description: 'Agent Discovery & Routing Protocol',
    },
  },
  
  // Contact categories (the 13 canonical categories)
  categories: [
    'Executive',
    'Startup Founder',
    'Engineering',
    'Sales/BD',
    'Consulting',
    'Marketing',
    'AI/ML',
    'Education',
    'VC/Investment',
    'Healthcare',
    'Manufacturing',
    'Robotics',
    'Other',
  ] as const,
  
  // Three-product convergence model
  ecosystem: {
    reflectionsMatch: 'Who you are',
    daymaker: 'Who you know',
    matchwise: 'Who you should meet',
  },
} as const;

export type Category = typeof BRAND.categories[number];
export type PlanType = keyof typeof BRAND.plans;
