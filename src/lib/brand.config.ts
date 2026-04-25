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
  proPriceMonthly: 39,
  proPriceCurrency: 'USD',
  proPriceAnnualLaunch: 199,

  // Pricing display structure for marketing surfaces.
  pricing: {
    free: {
      name: 'Free',
      price: 0,
      displayPrice: 'Free',
      cadence: 'forever',
    },
    paid: {
      name: 'Pro',
      price: 39,
      displayPrice: '$39',
      cadence: 'month',
    },
    annualLaunchOffer: {
      name: 'Annual Launch Offer',
      price: 199,
      displayPrice: '$199',
      cadence: 'year',
      isLimitedTime: true,
      framingCopy: 'Limited-time launch pricing',
    },
  },

  // Plan names. All limits are per calendar month and reset with the user's
  // `currentMonthString` rollover. Infinity = unlimited.
  plans: {
    free: {
      name: 'Free',
      queryLimit: 3,
      deepDiveLimit: 1,
      eventLimit: 0,        // Event Briefings are Pro-only
      contactLimit: 500,
    },
    pro: {
      name: 'Pro',
      queryLimit: Infinity,
      deepDiveLimit: Infinity,
      eventLimit: Infinity,
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
