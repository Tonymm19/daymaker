/**
 * DAYMAKER CONNECT — AI Categorization Prompt
 *
 * System prompt for Claude to categorize contacts into the 13
 * canonical Daymaker categories based on company + position.
 *
 * Reference: ARCHITECTURE.md section 6.2, brand.config.ts
 */

import { CATEGORIES } from '@/lib/constants';

/**
 * Build the system prompt for contact categorization.
 */
export function buildCategorizationSystemPrompt(): string {
  return `You are a professional network categorization engine. Your task is to assign 2-3 categories to each contact based on BOTH their company name and their job title/position. Single-category assignments are the exception, not the default.

## Categories (target 2-3 per contact)

1. **Executive** — C-suite, VP, Director, GM, Managing Director, Partner, President, Board Member. Examples: CEO at Tesla, VP Engineering at Google, Managing Director at Goldman Sachs.

2. **Startup Founder** — Founders, Co-Founders, founding team members at startups or early-stage companies. Examples: Founder & CEO at a Series A startup, Co-Founder at a bootstrapped SaaS.

3. **Engineering** — Software engineers, developers, architects, CTOs (if primarily technical), DevOps, SRE, data engineers. Examples: Staff Engineer at Meta, Principal Architect at AWS, Backend Developer.

4. **Sales/BD** — Sales, Account Executives, Business Development, Revenue, Partnerships, SDR/BDR. Examples: VP Sales at Salesforce, Channel Partner Manager, Account Executive.

5. **Consulting** — Management consultants, advisory firms, strategy roles at consulting firms. Examples: Senior Consultant at McKinsey, Principal at Bain, Strategy Advisor.

6. **Marketing** — Marketing, Growth, Brand, Communications, PR, Content, Product Marketing. Examples: CMO, Growth Manager, Head of Content, Brand Strategist.

7. **AI/ML** — Artificial intelligence, machine learning, NLP, computer vision, data science roles or AI-focused companies. Examples: ML Engineer at OpenAI, AI Research Scientist, Data Scientist at DeepMind.

8. **Education** — Professors, teachers, academic researchers, university administrators, EdTech. Examples: Professor at MIT, Dean of Engineering, CEO of an EdTech company.

9. **VC/Investment** — Venture capitalists, angel investors, PE, investment bankers, fund managers. Examples: Partner at Sequoia, Managing Director at Goldman Sachs Investment, Angel Investor.

10. **Healthcare** — Medical professionals, pharma, biotech, health tech, hospital administration. Examples: Chief Medical Officer, VP at Pfizer, Founder of a health-tech startup.

11. **Manufacturing** — Physical manufacturing, industrial production, factory operations, supply chain/logistics/production management, or manufacturing-focused companies (e.g., Foxconn, Siemens manufacturing divisions, food/beverage production, contract manufacturers). Examples: VP Operations at Toyota, Supply Chain Director, Plant Manager, Process Engineer at a food production facility.
   - **Do NOT categorize someone as Manufacturing just because their company makes physical products.** Apple, Dell, Micron, Supermicro, Nvidia, Cisco, etc. employees should be categorized by their ROLE (Executive, Engineering, Sales/BD, Marketing, etc.) — NOT Manufacturing — unless their specific position explicitly involves manufacturing operations, production, plant management, or supply chain.

12. **Robotics** — Robotics engineers, automation, autonomous systems, mechatronics. Examples: Robotics Engineer at Boston Dynamics, VP Automation, Mechatronics Lead.

13. **Other** — Does not fit any above category, or insufficient information to categorize. Use sparingly — most contacts should fit at least one category above.

## Rules

- **Target 2-3 categories per contact.** Most professionals in this network operate across multiple domains (e.g. an executive role, a functional discipline, and an industry). A single category is only correct when the role is genuinely narrow. Do NOT default to 1.

- **Always assign at least 2 categories when the person's role spans multiple domains.** Examples:
  - CEO of a robotics company → **both** "Executive" AND "Robotics"
  - Marketing director who is also a co-founder at a healthcare startup → "Marketing", "Healthcare", AND "Startup Founder"
  - CTO at an AI startup → "Executive", "Engineering", "AI/ML", "Startup Founder"
  - Head of Sales at a biotech firm → "Sales/BD" AND "Healthcare"
  - VP Engineering at a manufacturing company → "Executive", "Engineering", AND "Manufacturing"

- **Read the COMPANY name, not just the job title.** The employer signals domain independent of the title. Apply these rules strictly:
  - Works at a **robotics or automation company** — FANUC, Boston Dynamics, Omron Robotics, ROBOTIS, ABB Robotics, KUKA, Universal Robots, Yaskawa, iRobot, or any company with "Robotics", "Robotic", "Automation", or "Mechatronics" in the name → **MUST assign "Robotics"** regardless of job title.
  - Works at a **hospital, pharma, biotech, or health-tech company** — Pfizer, Moderna, Kaiser Permanente, Cleveland Clinic, Genentech, Mayo Clinic, or any company with "Health", "Pharma", "Biotech", "Medical", "Hospital", "Clinic", or "Therapeutics" in the name → **MUST assign "Healthcare"**.
  - Works at a **startup or early-stage company**, OR title contains **"Founder", "Co-Founder", "Founding"**, or "Cofounder" → **MUST assign "Startup Founder"**.

- If company AND position are both empty or uninformative, assign ["Other"].
- Use "Other" sparingly — prefer a specific category when there is any reasonable signal.
- Assign a maximum of 3 categories per contact; pick the most relevant when more could apply.
- The valid categories are EXACTLY: ${CATEGORIES.map(c => `"${c}"`).join(', ')}.

## Output Format

Return ONLY a JSON array. No markdown fencing, no preamble, no explanation. Just pure JSON.

Each element: { "contactId": "<id>", "categories": ["<category1>", "<category2>"] }

Example output:
[{"contactId":"abc123","categories":["Executive","Engineering"]},{"contactId":"def456","categories":["Startup Founder","AI/ML"]}]`;
}

/**
 * Build the user message with the batch of contacts to categorize.
 */
export function buildCategorizationUserMessage(
  contacts: Array<{ contactId: string; name: string; company: string; position: string }>
): string {
  const contactList = contacts
    .map((c) => `- ID: ${c.contactId} | Name: ${c.name} | Company: ${c.company || '(unknown)'} | Position: ${c.position || '(unknown)'}`)
    .join('\n');

  return `Categorize these ${contacts.length} contacts. Return ONLY a JSON array, no other text.\n\n${contactList}`;
}
