/**
 * Stage 3 — the approved public-website content packet, expressed as data the
 * authenticated administrator submits through the ordinary CMS server boundary.
 *
 * This is NOT hard-coded page content: no public route reads this module. It is
 * editorial source text offered inside the platform-administration screen so a
 * signed-in platform administrator can create real CMS rows in one action. Each
 * record is created through `adminSaveContent` with the caller's own Supabase
 * client, so RLS, lifecycle validation, publication timestamps and audit
 * attribution behave exactly as they do for a hand-typed record. Publication
 * remains a separate, explicit administrator action.
 *
 * Testimonials and merchandise are intentionally absent: no genuine testimonial
 * with documented permission and no verified product exist.
 */
import type { CmsTable } from "@/lib/public-site.schemas";

export interface PreparedRecord {
  /** Human label used in the confirmation list. */
  label: string;
  /** camelCase values matching the entity's input schema. */
  values: Record<string, unknown>;
}

export interface PreparedSet {
  /** Column compared against existing rows so nothing is ever duplicated. */
  identityColumn: string;
  /** Key inside `values` holding the same identity. */
  identityKey: string;
  records: PreparedRecord[];
}

const HOME: PreparedRecord[] = [
  {
    label: "Homepage — hero",
    values: {
      contentKey: "home.hero",
      pageSlug: "home",
      title: "Learning that fits your family, your school, your pace",
      summary:
        "LearnFlow is a curriculum, learning and administration platform for homeschools, tutors, learning centres and small schools.",
      bodyMarkdown: `LearnFlow brings the parts of alternative education that usually live in separate places — curriculum structure, lesson planning, assignments, assessment, progress records and family communication — into one place.

Set up your learners once. Plan against a structured curriculum. Record work and progress as it happens. Share what matters with the people who need to see it.`,
      displayOrder: 10,
    },
  },
  {
    label: "Homepage — learning options",
    values: {
      contentKey: "home.learning-options",
      pageSlug: "home",
      title: "Two ways to learn with LearnFlow",
      summary: "Choose full-time homeschooling or part-time supplementary tuition.",
      bodyMarkdown: `**Full-time homeschooling.** Your learner's whole school programme runs on LearnFlow: curriculum enrollment, planning, assignments, assessment and progress records in one continuous record.

**Part-time tuition.** Supplementary support alongside an existing school. Use LearnFlow for the subjects and periods you need, without duplicating the rest.

Both options use the same curriculum structure and the same progress records, so a learner can move between them without losing history.`,
      displayOrder: 20,
    },
  },
  {
    label: "Homepage — who we support",
    values: {
      contentKey: "home.who-we-support",
      pageSlug: "home",
      title: "Who LearnFlow supports",
      summary:
        "Families, tutors, learning centres, academies, small schools and education organizations.",
      bodyMarkdown: `- **Homeschooling families** — plan, teach and keep an orderly record of each child's learning.
- **Tutors** — manage learners across households with clear relationships and permissions.
- **Learning centres and academies** — run several groups under one organization.
- **Small and private schools** — staff, learners and curriculum in a single tenant.
- **Education organizations and NGOs** — support learners across multiple settings.

Each organization's data is separated at the database level, so one tenant never sees another tenant's learners, work or records.`,
      displayOrder: 30,
    },
  },
  {
    label: "Homepage — how it works",
    values: {
      contentKey: "home.how-it-works",
      pageSlug: "home",
      title: "How it works",
      summary: "Four steps from account to recorded progress.",
      bodyMarkdown: `1. **Create your organization.** A family, tutoring practice, centre or school.
2. **Add learners and the adults around them.** Parents, guardians, teachers and tutors are linked to learners through explicit relationships, so access is always deliberate.
3. **Choose a curriculum pathway.** Enroll each learner at the right level and subject set. Availability of a given curriculum depends on verified publication rights.
4. **Teach and record.** Plan lessons, set assignments, run assessments and keep progress visible to the people entitled to see it.`,
      displayOrder: 40,
    },
  },
  {
    label: "Homepage — why LearnFlow",
    values: {
      contentKey: "home.why-learnflow",
      pageSlug: "home",
      title: "Why LearnFlow",
      summary: "Structure, privacy and one continuous record.",
      bodyMarkdown: `**One continuous record.** Planning, work and results live together, so a learner's history is not scattered across documents and chat threads.

**Deliberate access.** Every adult sees a learner only through a recorded relationship or role. Permissions are enforced by the database, not only by the interface.

**Built for how alternative education actually runs.** Multiple roles per person, learners in more than one setting, and full-time or part-time study are normal cases here, not workarounds.

**Accessible by design.** Readable typography, keyboard navigation, visible focus and reduced-motion support across the platform, with stronger contrast on learning content.`,
      displayOrder: 50,
    },
  },
  {
    label: "Homepage — get started",
    values: {
      contentKey: "home.get-started",
      pageSlug: "home",
      title: "Talk to us about your setup",
      summary: "Book a consultation, or sign in if you already have an account.",
      bodyMarkdown: `Tell us who you are teaching and how you work today, and we will walk you through whether LearnFlow fits. Use **Book a consultation** to request a conversation, or **Contact** for a written question.`,
      displayOrder: 60,
    },
  },
];

const ABOUT: PreparedRecord[] = [
  {
    label: "About — what we are",
    values: {
      contentKey: "about.what-we-are",
      pageSlug: "about",
      title: "About LearnFlow",
      summary: "A school-level education platform for homeschools, tutors and small institutions.",
      bodyMarkdown: `LearnFlow is software for running school-level education outside — or alongside — a conventional school. It covers Grades 1 to 12 and the people involved in them: learners, parents and guardians, teachers, tutors and administrators.

We build the administrative and record-keeping layer. The teaching remains yours.`,
      displayOrder: 10,
    },
  },
  {
    label: "About — what we believe",
    values: {
      contentKey: "about.what-we-believe",
      pageSlug: "about",
      title: "What we believe",
      summary: "Structure should support teaching, not replace it.",
      bodyMarkdown: `- Families and educators know their learners; software should make their work easier to organize, not dictate it.
- A learner's record belongs to the learner and the adults responsible for them, and should be portable across settings.
- Privacy is a default, not a setting. Data about children is handled narrowly and deliberately.
- Clear structure — curriculum, levels, subjects, objectives — makes progress legible without turning learning into paperwork.`,
      displayOrder: 20,
    },
  },
  {
    label: "About — scope",
    values: {
      contentKey: "about.scope",
      pageSlug: "about",
      title: "What LearnFlow covers, and what it does not",
      summary: "School-level education only.",
      bodyMarkdown: `LearnFlow supports school-level education: Grades 1 to 12.

It does not cover university, TVET or other post-school study, and it does not issue certificates, qualifications or credentials. Where a curriculum pathway is offered, its availability depends on verified publication rights; a pathway that has not been verified is not shown as available.`,
      displayOrder: 30,
    },
  },
];

const WHY: PreparedRecord[] = [
  {
    label: "Why Choose Us — built for alternative education",
    values: {
      contentKey: "why.built-for-alternative-education",
      pageSlug: "why-choose-us",
      title: "Built for alternative education, not adapted to it",
      summary: "Multi-role, multi-setting and part-time study are first-class cases.",
      bodyMarkdown: `Most school software assumes one school, one timetable and one role per person. Homeschools, tutors and learning centres rarely look like that. In LearnFlow a person can be a parent and a teacher, a learner can study full-time or part-time, and an organization can run several groups — without duplicate accounts or parallel spreadsheets.`,
      displayOrder: 10,
    },
  },
  {
    label: "Why Choose Us — access you can explain",
    values: {
      contentKey: "why.privacy-and-access",
      pageSlug: "why-choose-us",
      title: "Access you can explain",
      summary: "Relationships and roles decide what each person sees.",
      bodyMarkdown: `Access follows recorded relationships: parent to learner, teacher to learner, tutor to learner, and membership of an organization. Those rules are enforced in the database itself, so hiding a button is never the only thing standing between someone and a child's record. Inactive or revoked memberships grant nothing.`,
      displayOrder: 20,
    },
  },
  {
    label: "Why Choose Us — records that hold up",
    values: {
      contentKey: "why.records",
      pageSlug: "why-choose-us",
      title: "Records that hold up",
      summary: "Planning, work, assessment and progress in one place.",
      bodyMarkdown: `Lesson plans, assignments, submissions, assessment results and progress notes stay connected to the curriculum they belong to. When you need to show what a learner has covered — to a parent, a tutor or yourself at the end of a term — the answer is already assembled.`,
      displayOrder: 30,
    },
  },
  {
    label: "Why Choose Us — usable devices",
    values: {
      contentKey: "why.accessible",
      pageSlug: "why-choose-us",
      title: "Usable on the devices people actually have",
      summary: "Mobile-first, keyboard-friendly, high contrast on learning content.",
      bodyMarkdown: `LearnFlow is designed for a phone first and scales up to a laptop. Targets are large enough to tap, focus is always visible for keyboard users, motion can be reduced, and reading surfaces used for learning content are held to a stricter contrast standard than ordinary administrative screens.`,
      displayOrder: 40,
    },
  },
];

const SERVICES: PreparedRecord[] = [
  {
    label: "Services — full-time homeschooling",
    values: {
      contentKey: "services.full-time",
      pageSlug: "services",
      title: "Full-time homeschooling",
      summary: "A learner's complete school programme on LearnFlow.",
      bodyMarkdown: `Enroll a learner at their level, plan across subjects, set and mark work, and keep a continuous progress record for the whole year. Parents and guardians see their own children; teachers and tutors see the learners they are linked to.`,
      displayOrder: 10,
    },
  },
  {
    label: "Services — part-time tuition",
    values: {
      contentKey: "services.part-time",
      pageSlug: "services",
      title: "Part-time and supplementary tuition",
      summary: "Support for specific subjects alongside an existing school.",
      bodyMarkdown: `Use LearnFlow for the subjects where a learner needs extra support. Sessions, assignments and results are recorded against the same curriculum structure, so the supplementary work sits in context rather than in isolation.`,
      displayOrder: 20,
    },
  },
  {
    label: "Services — organizations",
    values: {
      contentKey: "services.organizations",
      pageSlug: "services",
      title: "For tutors, centres and schools",
      summary: "Run an organization with staff, learners and shared curriculum.",
      bodyMarkdown: `An organization account adds administrators, staff membership, learner groups and organization-wide oversight. Administrators control who may author content for the tenant, and every record stays inside that tenant.`,
      displayOrder: 30,
    },
  },
  {
    label: "Services — extracurricular programmes",
    values: {
      contentKey: "services.extracurricular",
      pageSlug: "services",
      title: "Extracurricular programmes",
      summary: "Clubs and activities alongside academic study.",
      bodyMarkdown: `Organizations can run programmes outside the academic timetable — academic support, languages, arts, music, STEM, sport, technology, life skills and general enrichment — with instructors, optional capacity limits, a schedule description and enrollment that is tracked to completion.

Programmes are an internal record of participation. LearnFlow does not issue certificates for them.`,
      displayOrder: 40,
    },
  },
  {
    label: "Services — curriculum pathways",
    values: {
      contentKey: "services.curriculum-pathways",
      pageSlug: "services",
      title: "Curriculum pathways",
      summary: "Structured pathways, offered only where publication rights are verified.",
      bodyMarkdown: `LearnFlow's curriculum model supports Kenya CBC/CBE (Grades 1–12: Primary 1–6, Junior Secondary 7–9, Senior Secondary 10–12), Cambridge International, Pearson Edexcel and a generic American K–12 pathway.

Each pathway is structured as provider, curriculum, version, stage, level, subject, curriculum nodes and learning objectives. A pathway becomes selectable only once its content is complete, current and covered by verified publication rights. Ask us which pathways are available for your situation.`,
      displayOrder: 50,
    },
  },
];

const GUIDES: PreparedRecord[] = [
  {
    label: "Guide — what homeschooling actually involves",
    values: {
      slug: "what-is-homeschooling",
      title: "What homeschooling actually involves",
      summary:
        "A plain look at the work, the rhythm and the record-keeping behind home-based education.",
      category: "getting-started",
      tags: ["homeschooling", "getting started"],
      readingMinutes: 5,
      seoDescription:
        "A practical introduction to homeschooling: planning, daily rhythm, record-keeping and the support families usually need.",
      displayOrder: 10,
      bodyMarkdown: `Homeschooling means the family takes responsibility for a child's school-level education, usually at home and often with outside help for particular subjects.

## The four things you will actually do

**Decide on a curriculum pathway.** This sets the levels, subjects and learning objectives you are working towards, and makes progress measurable.

**Plan the year, then the week.** Most families work backwards: the subjects for the year, the topics for the term, then a weekly rhythm they can sustain.

**Teach and set work.** Some of this is direct teaching, some is independent work, and some is outsourced to a tutor or a group class.

**Keep records.** What was covered, what was submitted, how the learner did. Records matter when a child moves between settings, when another adult takes over a subject, or simply when you want to see progress honestly.

## What tends to be hardest

Consistency, not capability. Families rarely struggle to teach; they struggle to keep the planning and records going for a full year. Reducing the administrative load is where a platform helps most.

## Getting support

You do not have to do everything yourself. Tutors, learning centres and co-operative groups can take specific subjects while you keep oversight of the whole programme.`,
    },
  },
  {
    label: "Guide — choosing a curriculum pathway",
    values: {
      slug: "choosing-a-curriculum-pathway",
      title: "How to choose a curriculum pathway",
      summary: "What to weigh when deciding which curriculum your learner should follow.",
      category: "curriculum",
      tags: ["curriculum", "planning"],
      readingMinutes: 6,
      seoDescription:
        "Questions to work through when choosing a curriculum pathway for a homeschooled or tutored learner.",
      displayOrder: 20,
      bodyMarkdown: `A curriculum pathway decides the structure of your learner's next few years, so it is worth a deliberate decision rather than a default.

## Questions worth answering first

**Where might this learner go next?** If a return to a local school is likely, alignment with that system's levels and subjects reduces friction later.

**How structured do you want to be?** Some pathways prescribe content tightly; others leave more room for your own sequencing.

**What can you resource?** Consider the subjects you can teach, the ones you will outsource, and any practical work that needs equipment or a group.

**What does your learner need right now?** A learner who is behind in one subject and ahead in another is normal. A pathway should tolerate that.

## Practical advice

Choose one pathway and stay with it long enough to judge it — usually a full year. Switching mid-year costs more than most families expect, because sequencing differs even when subject names match.

## Availability

In LearnFlow, a pathway can only be selected once its content is complete and its publication rights are verified. If a pathway you want is not selectable yet, contact us and we will tell you its exact status.`,
    },
  },
  {
    label: "Guide — planning a homeschool week",
    values: {
      slug: "planning-a-homeschool-week",
      title: "Planning a homeschool week that survives contact with reality",
      summary: "A simple weekly planning method that leaves room for interruptions.",
      category: "planning",
      tags: ["planning", "routine"],
      readingMinutes: 4,
      seoDescription:
        "A straightforward weekly planning method for homeschooling families, built around fixed blocks and deliberate slack.",
      displayOrder: 30,
      bodyMarkdown: `Most homeschool plans fail for the same reason: they assume a perfect week.

## Start with blocks, not hours

Divide the day into two or three blocks rather than timetabled periods. Put the subjects that need the most attention in the block where your learner is sharpest — for many children that is the first one.

## Fix a few anchors

Choose three or four fixed points in the week: a tutor session, a group class, a science practical, a weekly review. Everything else moves around them.

## Leave one empty block

Plan four days of content into five days of time. The spare block absorbs illness, appointments and the topic that took twice as long. If it is not needed, it becomes reading, a project or a day out.

## Review weekly, in writing

Ten minutes at the end of the week: what was covered, what slipped, what moves to next week. Written down, this is also your progress record.`,
    },
  },
  {
    label: "Guide — keeping good learning records",
    values: {
      slug: "keeping-good-learning-records",
      title: "Keeping learning records you will actually be glad to have",
      summary: "What to record, how often, and why it matters later.",
      category: "records",
      tags: ["records", "assessment"],
      readingMinutes: 5,
      seoDescription:
        "What to record in home-based education — coverage, work, assessment and progress — and how to keep it sustainable.",
      displayOrder: 40,
      bodyMarkdown: `Records are not bureaucracy. They are how you answer, months later, what a learner has actually covered and how well.

## Record four things

**Coverage** — which objectives or topics were taught, and when.

**Work** — assignments set and submitted, with dates.

**Assessment** — results, with enough context to interpret them.

**Observations** — short notes on difficulty, confidence and effort.

## Keep it light enough to sustain

A sentence per subject per week beats a detailed report you abandon in March. Record as you go rather than reconstructing at the end of a term.

## Why it pays off

Records make handovers possible — to a tutor, a co-teaching parent or a school. They let you see a trend rather than a single bad day. And they protect the learner, because decisions about their education rest on evidence.`,
    },
  },
  {
    label: "Guide — working with a tutor",
    values: {
      slug: "working-with-a-tutor",
      title: "Working with a tutor without losing the thread",
      summary: "How to bring in outside teaching while keeping one coherent programme.",
      category: "support",
      tags: ["tutoring", "collaboration"],
      readingMinutes: 4,
      seoDescription:
        "Practical guidance on using tutors for part of a homeschool programme while keeping planning and records coherent.",
      displayOrder: 50,
      bodyMarkdown: `Bringing in a tutor is normal and sensible. The risk is that the tutored subject drifts into a separate programme with its own plan, its own records and no visibility for anyone else.

## Agree the scope in writing

Which subject, which objectives, over what period, and what counts as done.

## Share the same structure

Have the tutor work against the same curriculum objectives you are already using, and record work in the same place. Two parallel records become contradictory quickly.

## Set a review rhythm

A short monthly check — coverage, results, concerns — is usually enough. It is much easier than reconstructing a term in June.

## Keep access deliberate

A tutor should see the learners they teach and nothing else. In LearnFlow that is what a tutor-learner relationship grants, and revoking it removes the access.`,
    },
  },
];

const FAQS: PreparedRecord[] = (
  [
    [
      "Who is LearnFlow for?",
      "general",
      10,
      "Homeschooling families, tutors, learning centres, academies, small and private schools, and education organizations working with school-level learners in Grades 1 to 12.",
    ],
    [
      "Which curriculum pathways does LearnFlow support?",
      "curriculum",
      20,
      "The platform's curriculum model supports Kenya CBC/CBE (Grades 1–12), Cambridge International, Pearson Edexcel and a generic American K–12 pathway. A pathway becomes selectable only once its content is complete, current and covered by verified publication rights, so ask us about the current status for your situation.",
    ],
    [
      "Does LearnFlow cover pre-primary, university or TVET?",
      "curriculum",
      30,
      "No. LearnFlow covers school-level education only, Grades 1 to 12. Pre-primary levels, university, TVET and other post-school study are outside its scope.",
    ],
    [
      "Does LearnFlow issue certificates or qualifications?",
      "general",
      40,
      "No. LearnFlow does not issue certificates, qualifications, credentials or accreditation of any kind. It records what a learner has covered and how they performed; formal qualifications come from the relevant examining body.",
    ],
    [
      "Can one person hold more than one role?",
      "accounts",
      50,
      "Yes. A person can be, for example, both a parent and a teacher. Roles are recorded separately and each one grants only its own access.",
    ],
    [
      "How is my family's data kept separate from other organizations?",
      "privacy",
      60,
      "Each organization's data is isolated at the database level, and access rules are enforced there rather than only in the interface. A person sees a learner only through a recorded relationship or role, and an inactive or revoked membership grants nothing.",
    ],
    [
      "Can a learner study part-time while attending another school?",
      "learning",
      70,
      "Yes. Part-time supplementary study uses the same curriculum structure and the same progress records as a full-time programme, so work done with LearnFlow sits in context.",
    ],
    [
      "What do I need to get started?",
      "getting-started",
      80,
      "A device with a web browser and an internet connection, the learners you want to add, and a sense of which subjects you will teach yourself and which you will outsource. Book a consultation and we will talk it through.",
    ],
    [
      "Does LearnFlow work on a phone?",
      "technical",
      90,
      "Yes. The platform is designed for a phone first and works up to a full desktop screen, with keyboard navigation, visible focus and reduced-motion support throughout.",
    ],
    [
      "How do I get help?",
      "support",
      100,
      "Use the Contact page for a written question, or Book a consultation for a conversation about your setup.",
    ],
  ] as Array<[string, string, number, string]>
).map(([question, category, displayOrder, answerMarkdown]) => ({
  label: `FAQ — ${question}`,
  values: { question, category, displayOrder, answerMarkdown },
}));

export const PREPARED_CONTENT: Partial<Record<CmsTable, PreparedSet>> = {
  site_content: {
    identityColumn: "content_key",
    identityKey: "contentKey",
    records: [...HOME, ...ABOUT, ...WHY, ...SERVICES],
  },
  guide_articles: {
    identityColumn: "slug",
    identityKey: "slug",
    records: GUIDES,
  },
  faqs: {
    identityColumn: "question",
    identityKey: "question",
    records: FAQS,
  },
};
