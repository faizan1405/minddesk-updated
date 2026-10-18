// Built-in version-controlled templates for MindDesk.
// Avoids database migrations and allows immediate instantiation across all MindDesk modules.
import { newBlockId, type PageContent } from "@/lib/page-content";
import { normalizeMindMapImport } from "@/lib/mindmap-import";
import type { MapDoc } from "@/lib/mindmap-doc";

export type TemplateCategory = "notes" | "tasks" | "projects" | "mind-maps";

export type NoteTemplateContent = PageContent;

export type TaskTemplateContent = {
  defaultListName: string;
  tasks: Array<{
    title: string;
    description?: string;
    subtasks?: string[];
  }>;
};

export type ProjectTemplateContent = {
  defaultProjectTitle: string;
  pages: Array<{
    title: string;
    content: PageContent;
    subpages?: Array<{
      title: string;
      content: PageContent;
    }>;
  }>;
};

export type MindMapRawHierarchy = {
  title: string;
  children: Array<{
    title: string;
    color?: string;
    children?: Array<{
      title: string;
      color?: string;
      children?: Array<{
        title: string;
        color?: string;
      }>;
    }>;
  }>;
};

export type TemplateDefinition = {
  id: string;
  title: string;
  category: TemplateCategory;
  description: string;
  tags: string[];
  icon: string;
  color: string;
  previewSummary: string;
  noteContent?: NoteTemplateContent;
  taskData?: TaskTemplateContent;
  projectData?: ProjectTemplateContent;
  mindMapHierarchy?: MindMapRawHierarchy;
};

// Helper to construct note content blocks cleanly
const block = (type: "p" | "check" | "number" | "bullet", text: string, checked?: boolean) => ({
  id: newBlockId(),
  type,
  text,
  checked,
});

export const TEMPLATES: TemplateDefinition[] = [
  // ==================== NOTES TEMPLATES ====================
  {
    id: "note-meeting-notes",
    title: "Meeting Notes",
    category: "notes",
    description:
      "Structured agenda, key discussion points, decisions made, and clear action items.",
    tags: ["Meeting", "Action Items", "Productivity"],
    icon: "NotebookPen",
    color: "blue",
    previewSummary: "4 structured sections • 3 checklist action items",
    noteContent: {
      blocks: [
        block(
          "p",
          "Meeting Purpose: Align on sprint goals, review blockers, and assign action items.",
        ),
        block("p", "Date & Attendees: [Date] • Attendees: [Names]"),
        block("p", "---"),
        block("p", "Agenda Topics:"),
        block("bullet", "Review progress on previous milestone deliverables"),
        block("bullet", "Address technical bottlenecks and resource constraints"),
        block("bullet", "Agree on next milestone priorities and deadlines"),
        block("p", "---"),
        block("p", "Key Decisions:"),
        block("bullet", "Decision 1: Approved architecture adjustments for better scalability"),
        block("bullet", "Decision 2: Target QA sign-off date confirmed for next Friday"),
        block("p", "---"),
        block("p", "Action Items & Ownership:"),
        block("check", "Draft and share detailed technical specification", false),
        block("check", "Schedule follow-up review with stakeholders", false),
        block("check", "Update sprint backlog and priority cards", false),
      ],
    },
  },
  {
    id: "note-daily-journal",
    title: "Daily Journal",
    category: "notes",
    description:
      "Morning intention setting, daily priority focus, gratitude list, and evening reflection.",
    tags: ["Journal", "Mindfulness", "Daily Routine"],
    icon: "BookOpen",
    color: "amber",
    previewSummary: "Morning intentions • Top 3 priorities • Gratitude • Evening reflection",
    noteContent: {
      blocks: [
        block("p", "Morning Intentions:"),
        block(
          "p",
          "What is my primary focus for today? What will make today feel deeply fulfilling?",
        ),
        block("p", "---"),
        block("p", "Top 3 Priorities for Today:"),
        block("check", "Priority 1: Deep work on high-impact milestone", false),
        block("check", "Priority 2: Important client or stakeholder communication", false),
        block("check", "Priority 3: Quick administrative win or cleanup", false),
        block("p", "---"),
        block("p", "Gratitude & Perspective:"),
        block("bullet", "Something I appreciate right now: ..."),
        block("bullet", "A helpful relationship or interaction recently: ..."),
        block("bullet", "A small daily comfort or win: ..."),
        block("p", "---"),
        block("p", "Evening Wind-Down & Reflection:"),
        block("p", "What went really well today?"),
        block("p", "What is one thing I learned or can improve tomorrow?"),
      ],
    },
  },
  {
    id: "note-weekly-review",
    title: "Weekly Review",
    category: "notes",
    description:
      "End-of-week retrospective, celebrating wins, reviewing habit health, and planning next week.",
    tags: ["Review", "Retrospective", "Planning"],
    icon: "CalendarCheck",
    color: "emerald",
    previewSummary: "Accomplishments • Metrics & habits • Blockers • Next week's 3 big goals",
    noteContent: {
      blocks: [
        block("p", "Weekly Retrospective & Executive Summary:"),
        block("p", "Reviewing key wins, project velocity, and strategic alignment."),
        block("p", "---"),
        block("p", "Major Accomplishments This Week:"),
        block("bullet", "Shipped core milestone deliverable on schedule"),
        block("bullet", "Completed strategic planning and backlog prioritization"),
        block("bullet", "Maintained consistent daily focus and habit streaks"),
        block("p", "---"),
        block("p", "Habit Health & Productivity Assessment:"),
        block("p", "Review Focus Sessions and Habit streaks in Productivity Analytics."),
        block("bullet", "Focus time target met? (Yes/No notes)"),
        block("bullet", "Most consistent habits vs habits that need attention"),
        block("p", "---"),
        block("p", "What Could Be Improved / Blockers Encountered:"),
        block("p", "Identify friction points or context switching triggers: ..."),
        block("p", "---"),
        block("p", "Top 3 Strategic Goals for Next Week:"),
        block("check", "Strategic Goal 1: Deliverable focus", false),
        block("check", "Strategic Goal 2: Process optimization or refactor", false),
        block("check", "Strategic Goal 3: Outreach or partnership sync", false),
      ],
    },
  },
  {
    id: "note-sales-call-notes",
    title: "Sales Call Notes",
    category: "notes",
    description:
      "Prospect background, pain point discovery, BANT qualification, and follow-up commitments.",
    tags: ["Sales", "Discovery", "Client Call"],
    icon: "PhoneCall",
    color: "violet",
    previewSummary: "Prospect info • Pain points • BANT qualification • Next steps checklist",
    noteContent: {
      blocks: [
        block("p", "Prospect & Company Overview:"),
        block("p", "Contact Name: [Name] • Title: [Role] • Company: [Organization]"),
        block("p", "Industry: [Industry] • Current Team Size: [Team Count]"),
        block("p", "---"),
        block("p", "Current Workflow & Pain Points:"),
        block("bullet", "What is their current system or process?"),
        block("bullet", "What are the biggest bottlenecks costing them time or revenue?"),
        block("bullet", "What will happen if this problem remains unsolved?"),
        block("p", "---"),
        block("p", "Qualification (BANT):"),
        block("bullet", "Budget: Allocated / In approval / Exploration"),
        block("bullet", "Authority: Key decision maker vs internal champion"),
        block("bullet", "Need: Critical urgent priority vs exploratory"),
        block("bullet", "Timeline: Expected implementation target date"),
        block("p", "---"),
        block("p", "Agreed Next Steps:"),
        block("check", "Send recap email with custom proposal and pricing", false),
        block("check", "Share relevant case study or technical documentation", false),
        block("check", "Schedule demonstration or follow-up decision call", false),
      ],
    },
  },
  {
    id: "note-brainstorming-notes",
    title: "Brainstorming Notes",
    category: "notes",
    description:
      "Creative problem framing, unconstrained wild ideas, impact filtering, and immediate next experiments.",
    tags: ["Ideation", "Creative", "Strategy"],
    icon: "Lightbulb",
    color: "amber",
    previewSummary: "Challenge framing • 6 idea slots • Feasibility matrix • Next experiments",
    noteContent: {
      blocks: [
        block("p", "Challenge Framing:"),
        block(
          "p",
          "How might we significantly improve user productivity and delight with the least friction?",
        ),
        block("p", "---"),
        block("p", "Opportunity Areas:"),
        block("bullet", "Workflow automation and smart shortcuts"),
        block("bullet", "Visual summaries and proactive insights"),
        block("bullet", "Deep integrations and seamless imports"),
        block("p", "---"),
        block("p", "Wild & Unconstrained Ideas:"),
        block("bullet", "Idea 1: Intelligent real-time productivity scoring"),
        block("bullet", "Idea 2: 1-click template instantiation across all workspaces"),
        block("bullet", "Idea 3: Context-aware focus timer with habit coupling"),
        block("p", "---"),
        block("p", "Filtered Candidates (High Impact / Realistic Effort):"),
        block("bullet", "Top Candidate A: Rapid template library with instant preview"),
        block("bullet", "Top Candidate B: Productivity analytics dashboard"),
        block("p", "---"),
        block("p", "Next Experiments:"),
        block("check", "Prototype design mockups in Figma or browser", false),
        block("check", "Gather feedback from 3 target users", false),
        block("check", "Define minimum viable implementation scope", false),
      ],
    },
  },

  // ==================== TASKS TEMPLATES ====================
  {
    id: "task-daily-priorities",
    title: "Daily Priorities",
    category: "tasks",
    description:
      "A disciplined daily workflow: Most Important Tasks (MITs), quick momentum wins, and daily wrap-up.",
    tags: ["Daily", "MIT", "Priorities"],
    icon: "CheckSquare",
    color: "blue",
    previewSummary: "4 primary tasks • 8 organized subtasks",
    taskData: {
      defaultListName: "Daily Priorities",
      tasks: [
        {
          title: "Deep Work: Complete Most Important Task (MIT)",
          description: "Protect uninterrupted focus blocks for primary deliverable.",
          subtasks: [
            "Clarify acceptance criteria and final deliverable",
            "Perform uninterrupted 60-90 minute deep work block",
            "Self-review output against requirements",
          ],
        },
        {
          title: "Secondary Priority: Key Project Progress",
          description: "Advance milestone tasks and unblock team members.",
          subtasks: [
            "Review pull requests or project drafts",
            "Communicate status updates to stakeholders",
          ],
        },
        {
          title: "Quick Wins & Operational Catch-Up (<15 mins each)",
          description: "Batch process communication and administrative tasks.",
          subtasks: [
            "Clear urgent inbox messages and notifications",
            "Review calendar schedule for upcoming meetings",
          ],
        },
        {
          title: "End-of-Day Shutdown & Tomorrow Prep",
          description:
            "Clear open tabs, review completed items, and set top 3 priorities for tomorrow.",
          subtasks: ["Review completed tasks", "Write down top 3 priorities for tomorrow"],
        },
      ],
    },
  },
  {
    id: "task-weekly-planning",
    title: "Weekly Planning",
    category: "tasks",
    description:
      "Structured Monday-to-Friday execution plan balancing deep work, alignment, execution, and review.",
    tags: ["Weekly", "Sprint", "Work Plan"],
    icon: "CalendarDays",
    color: "emerald",
    previewSummary: "5 weekday tasks • 10 subtasks across the week",
    taskData: {
      defaultListName: "Weekly Execution Plan",
      tasks: [
        {
          title: "Monday: Sprint Kickoff & Strategic Alignment",
          description: "Set outcomes for the week and organize backlog priorities.",
          subtasks: [
            "Define top 3 measurable outcomes for this week",
            "Audit calendar and block dedicated focus time",
          ],
        },
        {
          title: "Tuesday: Uninterrupted Deep Work Day",
          description: "High-focus implementation day with minimal meeting distractions.",
          subtasks: [
            "Execute primary development or creative block",
            "Review architecture decisions with peer review",
          ],
        },
        {
          title: "Wednesday: Midweek Alignment & Stakeholder Sync",
          description: "Check milestone progress and resolve dependencies.",
          subtasks: [
            "Sync with key team members and clients",
            "Unblock any pending requirements or approvals",
          ],
        },
        {
          title: "Thursday: Refinement, Integration & QA",
          description: "Polish deliverables, test edge cases, and finalize documentation.",
          subtasks: [
            "Run automated tests and manual verification",
            "Prepare final documentation or release notes",
          ],
        },
        {
          title: "Friday: Review, Retrospective & Clean Slate",
          description:
            "Inspect weekly productivity analytics, celebrate wins, and reset for the weekend.",
          subtasks: [
            "Review weekly productivity metrics and habit consistency",
            "Achieve Inbox Zero and organize tasks for next Monday",
          ],
        },
      ],
    },
  },
  {
    id: "task-client-follow-up",
    title: "Client Follow-Up Checklist",
    category: "tasks",
    description:
      "End-to-end client engagement workflow from post-meeting recap to contract execution and onboarding.",
    tags: ["Client", "CRM", "Follow Up"],
    icon: "UserCheck",
    color: "violet",
    previewSummary: "4 client lifecycle phases • 9 action subtasks",
    taskData: {
      defaultListName: "Client Follow-Up Checklist",
      tasks: [
        {
          title: "Phase 1: Immediate Post-Meeting Actions (<24 Hours)",
          description: "Maintain momentum while discussion is fresh.",
          subtasks: [
            "Log discovery notes and key client pain points",
            "Send personalized recap email with agreed action items",
            "Attach proposal deck and preliminary timeline",
          ],
        },
        {
          title: "Phase 2: Mid-Week Engagement & Clarification",
          description: "Check in on proposal review and address questions.",
          subtasks: [
            "Confirm receipt and answer initial client questions",
            "Provide technical clarification on scope details",
          ],
        },
        {
          title: "Phase 3: Decision & Contract Finalization",
          description: "Finalize agreement terms and secure sign-off.",
          subtasks: [
            "Send finalized statement of work (SOW) or contract",
            "Verify signatures and deposit invoice processing",
          ],
        },
        {
          title: "Phase 4: Welcome & Onboarding Transition",
          description: "Smooth handover into project execution.",
          subtasks: [
            "Send client onboarding welcome kit and questionnaire",
            "Schedule project kickoff call",
          ],
        },
      ],
    },
  },
  {
    id: "task-project-launch-checklist",
    title: "Project Launch Checklist",
    category: "tasks",
    description:
      "Comprehensive go-live checklist covering QA smoke tests, analytics, announcements, and post-launch monitoring.",
    tags: ["Launch", "Deployment", "Checklist"],
    icon: "Rocket",
    color: "amber",
    previewSummary: "4 launch stages • 11 mission-critical verification subtasks",
    taskData: {
      defaultListName: "Project Launch Checklist",
      tasks: [
        {
          title: "Pre-Launch Quality Assurance & Staging",
          description: "Verify all features, security, and edge cases before release.",
          subtasks: [
            "Execute end-to-end user smoke tests",
            "Verify mobile responsiveness and cross-browser layouts",
            "Audit performance, SSL certificates, and security headers",
          ],
        },
        {
          title: "Marketing & Communications Readiness",
          description: "Ensure all launch collateral and channels are ready.",
          subtasks: [
            "Draft and schedule product announcement email",
            "Prepare social media launch threads and imagery",
            "Publish updated documentation and FAQ guides",
          ],
        },
        {
          title: "Go-Live Deployment & Production Cutover",
          description: "Deploy to production and confirm operational health.",
          subtasks: [
            "Deploy production build and run database migration check",
            "Perform live smoke test with real test accounts",
            "Verify error reporting and analytics telemetry",
          ],
        },
        {
          title: "Post-Launch Monitoring & Feedback",
          description: "Monitor user activity and address initial feedback rapidly.",
          subtasks: [
            "Monitor server logs and error rates for 24 hours",
            "Collect initial user reactions and support inquiries",
          ],
        },
      ],
    },
  },

  // ==================== PROJECTS TEMPLATES ====================
  {
    id: "project-website-development",
    title: "Website Development Project",
    category: "projects",
    description:
      "Complete modern web project workspace with scope, brand design, frontend, backend, and launch pages.",
    tags: ["Web Dev", "Software", "Milestones"],
    icon: "Globe",
    color: "blue",
    previewSummary: "5 structured pages & subpages covering scope, design, dev, and QA",
    projectData: {
      defaultProjectTitle: "Website Development Project",
      pages: [
        {
          title: "1. Scope & Project Overview",
          content: {
            blocks: [
              block(
                "p",
                "Project Objective: Build a high-performance, modern, responsive website.",
              ),
              block(
                "p",
                "Key Success Metrics: Lighthouse > 90, sub-second page loads, accessible UI.",
              ),
              block("p", "---"),
              block("p", "Core Deliverables:"),
              block("bullet", "Homepage, About, Features, Pricing, and Contact pages"),
              block("bullet", "CMS integration for blog posts and dynamic documentation"),
              block("bullet", "Responsive layouts tested across mobile, tablet, and desktop"),
            ],
          },
        },
        {
          title: "2. UI & Brand Design",
          content: {
            blocks: [
              block("p", "Design System & Style Guidelines:"),
              block("bullet", "Typography: Clean sans-serif with readable scale"),
              block("bullet", "Color Palette: Dark mode default with premium accent tones"),
              block("bullet", "Component Library: Accessible Radix UI and Tailwind CSS"),
            ],
          },
          subpages: [
            {
              title: "Brand Assets & Typography Guide",
              content: {
                blocks: [
                  block("p", "Asset Repository:"),
                  block("bullet", "SVGs for logo marks and vector icons"),
                  block("bullet", "Optimized WebP imagery and social open-graph cards"),
                ],
              },
            },
          ],
        },
        {
          title: "3. Frontend Implementation Plan",
          content: {
            blocks: [
              block("p", "Frontend Architecture:"),
              block("bullet", "Framework: React 19 + TanStack Router"),
              block("bullet", "State: TanStack React Query for async caching"),
              block("bullet", "Animation: Lightweight CSS transitions with reduce-motion support"),
            ],
          },
        },
        {
          title: "4. Backend & API Integrations",
          content: {
            blocks: [
              block("p", "Backend Specifications:"),
              block("bullet", "Nitro server with REST endpoints"),
              block("bullet", "MySQL via Prisma ORM for relational data storage"),
              block("bullet", "Secure session authentication via HTTP-only cookies"),
            ],
          },
        },
        {
          title: "5. QA & Launch Readiness",
          content: {
            blocks: [
              block("p", "Launch Readiness Checklist:"),
              block("check", "TypeScript check (0 errors)", false),
              block("check", "Automated unit tests passing", false),
              block("check", "SEO meta tags, sitemap, and robots.txt configured", false),
              block("check", "Hostinger production deployment verified", false),
            ],
          },
        },
      ],
    },
  },
  {
    id: "project-client-onboarding",
    title: "Client Onboarding",
    category: "projects",
    description:
      "Professional client workspace containing kickoff master plan, credentials checklist, milestones, and handoff.",
    tags: ["Client Success", "Onboarding", "Operations"],
    icon: "Users",
    color: "emerald",
    previewSummary: "5 comprehensive client lifecycle documentation pages",
    projectData: {
      defaultProjectTitle: "Client Onboarding Workspace",
      pages: [
        {
          title: "1. Onboarding Master Plan",
          content: {
            blocks: [
              block("p", "Welcome to the client onboarding workspace."),
              block("p", "Client: [Client Name] • Project Sponsor: [Contact Name]"),
              block("p", "Project Target Completion Date: [Target Date]"),
              block("p", "---"),
              block("p", "Communication Cadence:"),
              block("bullet", "Weekly 30-minute progress video call (Tuesdays at 10:00 AM)"),
              block("bullet", "Asynchronous updates via email and workspace task tracking"),
            ],
          },
        },
        {
          title: "2. Access & Technical Setup",
          content: {
            blocks: [
              block("p", "Required Access & Permissions:"),
              block("check", "Repository access or code collaboration invites", false),
              block("check", "Staging environment credentials and API tokens", false),
              block("check", "Brand assets, design files, and documentation", false),
            ],
          },
          subpages: [
            {
              title: "Environment & Credentials Inventory",
              content: {
                blocks: [
                  block("p", "Secure Credential Checklist:"),
                  block(
                    "p",
                    "Store all sensitive secrets in protected environment variables only.",
                  ),
                ],
              },
            },
          ],
        },
        {
          title: "3. Scope & Milestone Roadmap",
          content: {
            blocks: [
              block("p", "Milestone 1: Discovery & Technical Specification (Week 1)"),
              block("p", "Milestone 2: Prototype & Architecture Review (Week 2-3)"),
              block("p", "Milestone 3: Implementation & Integration (Week 4-6)"),
              block("p", "Milestone 4: QA, User Acceptance Testing & Sign-off (Week 7)"),
            ],
          },
        },
        {
          title: "4. Project Deliverables & Review Log",
          content: {
            blocks: [
              block("p", "Review Log:"),
              block("bullet", "Deliverable 1: [Status / Approval Date]"),
              block("bullet", "Deliverable 2: [Status / Approval Date]"),
            ],
          },
        },
        {
          title: "5. Handoff & Ongoing Support",
          content: {
            blocks: [
              block("p", "Final Handoff Criteria:"),
              block("check", "Admin credentials transferred", false),
              block("check", "User guide and video walk-through delivered", false),
              block("check", "30-day post-launch warranty support initiated", false),
            ],
          },
        },
      ],
    },
  },
  {
    id: "project-marketing-campaign",
    title: "Marketing Campaign",
    category: "projects",
    description:
      "End-to-end marketing launch blueprint with strategy, content calendar, distribution channels, and analytics review.",
    tags: ["Marketing", "Campaign", "Growth"],
    icon: "Megaphone",
    color: "amber",
    previewSummary: "5 strategic pages for campaign planning, content, and analytics",
    projectData: {
      defaultProjectTitle: "Q4 Growth Marketing Campaign",
      pages: [
        {
          title: "1. Campaign Strategy & Goals",
          content: {
            blocks: [
              block("p", "Campaign Theme: Elevate productivity with modern workflow tools."),
              block("p", "Target Persona: Founders, software engineers, and busy professionals."),
              block("p", "---"),
              block("p", "Core Key Performance Indicators (KPIs):"),
              block("bullet", "New user registrations: +500 active signups"),
              block("bullet", "Product engagement: 40% weekly active retention"),
              block("bullet", "Organic referral sharing rate: > 15%"),
            ],
          },
        },
        {
          title: "2. Content Calendar & Creative Copy",
          content: {
            blocks: [
              block("p", "Weekly Content Rhythm:"),
              block("bullet", "Monday: Educational productivity framework breakdown"),
              block("bullet", "Wednesday: Feature showcase and live demo reel"),
              block("bullet", "Friday: Customer case study and workflow tips"),
            ],
          },
          subpages: [
            {
              title: "Social Media Threads & Ad Copy Variations",
              content: {
                blocks: [
                  block("p", "Ad Copy Hook Variations:"),
                  block("bullet", "Hook A: 'Stop juggling 5 different apps for your daily work.'"),
                  block(
                    "bullet",
                    "Hook B: 'How high performers plan their week in under 10 minutes.'",
                  ),
                ],
              },
            },
          ],
        },
        {
          title: "3. Channel Distribution Plan",
          content: {
            blocks: [
              block("p", "Distribution Channels:"),
              block("bullet", "Organic: X/Twitter, LinkedIn, YouTube Shorts"),
              block("bullet", "Community: Product Hunt, Hacker News, Reddit communities"),
              block("bullet", "Direct: Email newsletter sequence to existing user base"),
            ],
          },
        },
        {
          title: "4. Campaign Launch Schedule",
          content: {
            blocks: [
              block("p", "Launch Timeline:"),
              block("check", "Day 1: Teaser trailer and early access invite", false),
              block("check", "Day 3: Public launch blast across all channels", false),
              block("check", "Day 7: First week performance review and retargeting", false),
            ],
          },
        },
        {
          title: "5. Performance Analytics & Learnings",
          content: {
            blocks: [
              block("p", "Post-Campaign Retrospective:"),
              block("bullet", "Total impressions and reach achieved: ..."),
              block("bullet", "Cost per acquisition (CPA) and conversion rates: ..."),
              block("bullet", "Key takeaways for the next campaign cycle: ..."),
            ],
          },
        },
      ],
    },
  },
  {
    id: "project-personal-goal-tracker",
    title: "Personal Goal Tracker",
    category: "projects",
    description:
      "Holistic life and career goal tracker organized across vision, career milestones, health habits, and quarterly reviews.",
    tags: ["Personal Growth", "Goals", "Habits"],
    icon: "Target",
    color: "violet",
    previewSummary: "5 life pillar pages including vision, career, health, finances, and reviews",
    projectData: {
      defaultProjectTitle: "Personal Goal Tracker",
      pages: [
        {
          title: "1. Annual Vision & Guiding Pillars",
          content: {
            blocks: [
              block("p", "Guiding Theme for the Year: Relentless execution with intentional calm."),
              block("p", "---"),
              block("p", "Core Life Pillars:"),
              block("bullet", "1. Mastery & Craft: Deepen technical and product leadership"),
              block("bullet", "2. Health & Energy: Sleep consistency, strength, and stamina"),
              block("bullet", "3. Wealth & Security: Prudent investing and financial independence"),
              block("bullet", "4. Connection: Quality time with family, friends, and mentors"),
            ],
          },
        },
        {
          title: "2. Career & Professional Milestones",
          content: {
            blocks: [
              block("p", "High-Impact Milestones:"),
              block("check", "Lead and ship flagship software product feature", false),
              block("check", "Publish 6 technical write-ups and architectural insights", false),
              block("check", "Establish valuable mentorship relationship", false),
            ],
          },
          subpages: [
            {
              title: "Reading List & Continuous Learning",
              content: {
                blocks: [
                  block("p", "Target: Read 12 impactful books this year."),
                  block("check", "Designing Data-Intensive Applications", false),
                  block("check", "Atomic Habits by James Clear", false),
                  block("check", "The Psychology of Money by Morgan Housel", false),
                ],
              },
            },
          ],
        },
        {
          title: "3. Health, Fitness & Vitality",
          content: {
            blocks: [
              block("p", "Health Metrics & Routines:"),
              block("bullet", "Strength training 4x per week (tracked in MindDesk Habits)"),
              block("bullet", "Minimum 7.5 hours sleep per night"),
              block("bullet", "Daily outdoor morning walk for sunlight and focus"),
            ],
          },
        },
        {
          title: "4. Financial Independence & Investments",
          content: {
            blocks: [
              block("p", "Financial Goals:"),
              block("check", "Maintain 6-month liquid emergency fund", false),
              block("check", "Automate monthly index fund contributions", false),
              block("check", "Review annual budget and eliminate unused subscriptions", false),
            ],
          },
        },
        {
          title: "5. Quarterly Progress Reviews",
          content: {
            blocks: [
              block("p", "Quarterly Review Cadence:"),
              block("bullet", "Q1 Review (End of March): Progress check & adjustments"),
              block("bullet", "Q2 Review (End of June): Mid-year milestone reflection"),
              block("bullet", "Q3 Review (End of September): Acceleration towards year-end goals"),
              block(
                "bullet",
                "Q4 Review (End of December): Annual celebration & next year planning",
              ),
            ],
          },
        },
      ],
    },
  },

  // ==================== MIND MAPS TEMPLATES ====================
  {
    id: "mindmap-sales-process",
    title: "Sales Process",
    category: "mind-maps",
    description:
      "Visual breakdown of the B2B sales pipeline: Lead Gen, Discovery, Demo, Objection Handling, and Closing.",
    tags: ["Sales", "Pipeline", "Strategy"],
    icon: "Network",
    color: "blue",
    previewSummary: "6 pipeline stages with 18 structured subtopics",
    mindMapHierarchy: {
      title: "Sales Process",
      children: [
        {
          title: "1. Lead Generation",
          color: "blue",
          children: [
            { title: "Inbound Marketing & SEO", color: "blue" },
            { title: "Targeted Outbound Outreach", color: "blue" },
            { title: "Client Referrals", color: "blue" },
          ],
        },
        {
          title: "2. Discovery & Qualification",
          color: "teal",
          children: [
            { title: "Identify Core Pain Points", color: "teal" },
            { title: "BANT Criteria Check", color: "teal" },
            { title: "Decision Maker Mapping", color: "teal" },
          ],
        },
        {
          title: "3. Solution Demo",
          color: "emerald",
          children: [
            { title: "Customized Walkthrough", color: "emerald" },
            { title: "ROI & Impact Estimation", color: "emerald" },
            { title: "Case Study Proof Points", color: "emerald" },
          ],
        },
        {
          title: "4. Objection Handling",
          color: "amber",
          children: [
            { title: "Pricing & Budget Hesitation", color: "amber" },
            { title: "Implementation Timeline", color: "amber" },
            { title: "Competitor Comparison", color: "amber" },
          ],
        },
        {
          title: "5. Closing & Agreement",
          color: "violet",
          children: [
            { title: "Final Proposal & SOW", color: "violet" },
            { title: "Contract E-Signature", color: "violet" },
            { title: "Initial Deposit Processing", color: "violet" },
          ],
        },
        {
          title: "6. Customer Onboarding",
          color: "red",
          children: [
            { title: "Welcome Kit & Kickoff", color: "red" },
            { title: "Success Checkpoint Call", color: "red" },
            { title: "Referral & Expansion Opportunity", color: "red" },
          ],
        },
      ],
    },
  },
  {
    id: "mindmap-business-strategy",
    title: "Business Strategy",
    category: "mind-maps",
    description:
      "Comprehensive corporate strategy blueprint spanning Vision, Market Opportunity, Revenue, Product, and Growth.",
    tags: ["Business", "Strategy", "Roadmap"],
    icon: "Briefcase",
    color: "emerald",
    previewSummary: "6 strategic pillars with 18 detailed operational branches",
    mindMapHierarchy: {
      title: "Business Strategy",
      children: [
        {
          title: "Vision & Mission",
          color: "blue",
          children: [
            { title: "Core Purpose & Values", color: "blue" },
            { title: "Long-Term Market Position", color: "blue" },
            { title: "Cultural Principles", color: "blue" },
          ],
        },
        {
          title: "Market Opportunity",
          color: "teal",
          children: [
            { title: "Total Addressable Market (TAM)", color: "teal" },
            { title: "Ideal Customer Profile (ICP)", color: "teal" },
            { title: "Competitive Moat & Edge", color: "teal" },
          ],
        },
        {
          title: "Revenue Model",
          color: "emerald",
          children: [
            { title: "Subscription / Recurring Tiers", color: "emerald" },
            { title: "Enterprise Custom Contracts", color: "emerald" },
            { title: "Expansion & Add-on Services", color: "emerald" },
          ],
        },
        {
          title: "Product Roadmap",
          color: "amber",
          children: [
            { title: "Core Differentiator Features", color: "amber" },
            { title: "Analytics & Automation", color: "amber" },
            { title: "Platform Integrations", color: "amber" },
          ],
        },
        {
          title: "Growth & Distribution",
          color: "violet",
          children: [
            { title: "Organic Content & SEO Engine", color: "violet" },
            { title: "Direct Sales & Outreach", color: "violet" },
            { title: "Partnership & Ecosystem Loops", color: "violet" },
          ],
        },
        {
          title: "Execution & Operations",
          color: "red",
          children: [
            { title: "Lean High-Caliber Team", color: "red" },
            { title: "Operational Cash Reserves", color: "red" },
            { title: "Rapid Feedback Cycles", color: "red" },
          ],
        },
      ],
    },
  },
  {
    id: "mindmap-goal-planning",
    title: "Goal Planning",
    category: "mind-maps",
    description:
      "Multidimensional goal planning hierarchy connecting Financial, Career, Health, Relationships, and Systems.",
    tags: ["Personal", "Life Goals", "Systems"],
    icon: "Target",
    color: "amber",
    previewSummary: "5 life dimensions with actionable milestone subtopics",
    mindMapHierarchy: {
      title: "Goal Planning",
      children: [
        {
          title: "Financial Freedom",
          color: "emerald",
          children: [
            { title: "6-Month Liquid Reserve", color: "emerald" },
            { title: "Systematic Monthly Investing", color: "emerald" },
            { title: "Diversified Income Streams", color: "emerald" },
          ],
        },
        {
          title: "Career & Craft",
          color: "blue",
          children: [
            { title: "Technical Architecture Mastery", color: "blue" },
            { title: "High-Visibility Deliverables", color: "blue" },
            { title: "Industry Network & Mentorship", color: "blue" },
          ],
        },
        {
          title: "Health & Vitality",
          color: "teal",
          children: [
            { title: "Consistent Strength Training", color: "teal" },
            { title: "Sleep Optimization (8h)", color: "teal" },
            { title: "Nutritious Whole Foods", color: "teal" },
          ],
        },
        {
          title: "Relationships & Community",
          color: "violet",
          children: [
            { title: "Dedicated Family Time", color: "violet" },
            { title: "Deep Authentic Friendships", color: "violet" },
            { title: "Community Service & Mentoring", color: "violet" },
          ],
        },
        {
          title: "Systems & Routines",
          color: "amber",
          children: [
            { title: "Daily Deep Work Time-Blocks", color: "amber" },
            { title: "Weekly Friday Reviews", color: "amber" },
            { title: "MindDesk Habit Tracking", color: "amber" },
          ],
        },
      ],
    },
  },
  {
    id: "mindmap-swot-analysis",
    title: "SWOT Analysis",
    category: "mind-maps",
    description:
      "Classic strategic analysis quadrant mapping Strengths, Weaknesses, Opportunities, and Threats.",
    tags: ["Analysis", "SWOT", "Business"],
    icon: "Layers",
    color: "violet",
    previewSummary: "4 distinct quadrants with 12 analytical strategic factors",
    mindMapHierarchy: {
      title: "SWOT Analysis",
      children: [
        {
          title: "Strengths (Internal)",
          color: "emerald",
          children: [
            { title: "Fast High-Performance Codebase", color: "emerald" },
            { title: "Intuitive All-in-One Architecture", color: "emerald" },
            { title: "Agile Development Velocity", color: "emerald" },
          ],
        },
        {
          title: "Weaknesses (Internal)",
          color: "amber",
          children: [
            { title: "Limited Marketing & Brand Awareness", color: "amber" },
            { title: "Small Core Team Bandwidth", color: "amber" },
            { title: "Early Documentation Gaps", color: "amber" },
          ],
        },
        {
          title: "Opportunities (External)",
          color: "blue",
          children: [
            { title: "Growing Remote Work Demand", color: "blue" },
            { title: "Integrated Analytics & Templates", color: "blue" },
            { title: "Disillusionment with Cluttered Tools", color: "blue" },
          ],
        },
        {
          title: "Threats (External)",
          color: "red",
          children: [
            { title: "Entrenched Incumbent SaaS Tools", color: "red" },
            { title: "Rapid Shifting Tech Ecosystem", color: "red" },
            { title: "Economic Pressure on Subscriptions", color: "red" },
          ],
        },
      ],
    },
  },
  {
    id: "mindmap-learning-roadmap",
    title: "Learning Roadmap",
    category: "mind-maps",
    description:
      "Step-by-step technical learning curriculum from Core Foundations to Practical Projects, Architecture, and DevOps.",
    tags: ["Learning", "Education", "Tech Roadmap"],
    icon: "GraduationCap",
    color: "teal",
    previewSummary: "5 learning stages with 15 progressive skill subtopics",
    mindMapHierarchy: {
      title: "Learning Roadmap",
      children: [
        {
          title: "1. Core Foundations",
          color: "blue",
          children: [
            { title: "Syntax & Core Language Features", color: "blue" },
            { title: "Data Structures & Standard Library", color: "blue" },
            { title: "Git Version Control Workflow", color: "blue" },
          ],
        },
        {
          title: "2. Hands-On Practice",
          color: "teal",
          children: [
            { title: "Build Full-Stack CRUD Application", color: "teal" },
            { title: "Implement Real-Time State & Cache", color: "teal" },
            { title: "Write Automated Unit & Integration Tests", color: "teal" },
          ],
        },
        {
          title: "3. Advanced Architecture",
          color: "emerald",
          children: [
            { title: "Clean Code & Design Patterns", color: "emerald" },
            { title: "Relational Database Schema Design", color: "emerald" },
            { title: "Performance Profiling & Bottlenecks", color: "emerald" },
          ],
        },
        {
          title: "4. Deployment & DevOps",
          color: "amber",
          children: [
            { title: "CI/CD Build & Test Automation", color: "amber" },
            { title: "Production Hosting (Nitro / Node / Cloud)", color: "amber" },
            { title: "Error Monitoring & Telemetry", color: "amber" },
          ],
        },
        {
          title: "5. Mastery & Growth",
          color: "violet",
          children: [
            { title: "Contribute to Open Source Projects", color: "violet" },
            { title: "Publish Technical Deep-Dives", color: "violet" },
            { title: "Perform Peer Code & Architecture Reviews", color: "violet" },
          ],
        },
      ],
    },
  },
];

/**
 * Normalizes a mind map template hierarchy into a full, valid, arranged MapDoc
 * using the existing mind map JSON normalization system.
 */
export function getNormalizedMindMapDoc(template: TemplateDefinition): MapDoc {
  if (!template.mindMapHierarchy) {
    throw new Error(`Template ${template.id} does not contain mind map data.`);
  }
  const normalized = normalizeMindMapImport(template.mindMapHierarchy, template.title);
  return normalized.doc;
}
