# Stage 3 — CMS Publication Packet (owner-authorized step)

Publishing editorial content requires an authenticated platform-administrator
session. This workspace has no such session (`external_unmanaged`), so the
records below are prepared for the owner to enter and publish through the
administrator interface. This is a human authorization boundary, not a software
failure.

## How to publish

1. Open Lovable Preview → **Sign in** with an existing platform-administrator account.
2. Open **/admin/content**.
3. For each record below: create it in the listed table, paste the fields exactly, save as draft.
4. Review each record, then set status to **published**.
5. Confirm each public page no longer shows the "not published yet" state.

Every save and status change goes through the authenticated server boundary, so
publication timestamps and administrator audit attribution are recorded
automatically. Do not edit rows directly in the database.

## Content rules applied

No accreditation, certification, qualification, guaranteed-result, partnership,
enrollment-number, class-size, university or TVET claims. No invented operating
history. Curricula are described as supported pathways subject to the live
availability gate, never as currently available. Testimonials and merchandise
stay empty.

---

## 1. `site_content` — Homepage (`pageSlug: home`)

| # | contentKey | displayOrder |
|---|---|---|
| 1 | `home.hero` | 10 |
| 2 | `home.learning-options` | 20 |
| 3 | `home.who-we-support` | 30 |
| 4 | `home.how-it-works` | 40 |
| 5 | `home.why-learnflow` | 50 |
| 6 | `home.get-started` | 60 |

### 1.1 `home.hero`
- **title:** Learning that fits your family, your school, your pace
- **summary:** LearnFlow is a curriculum, learning and administration platform for homeschools, tutors, learning centres and small schools.
- **bodyMarkdown:**

```
LearnFlow brings the parts of alternative education that usually live in
separate places — curriculum structure, lesson planning, assignments,
assessment, progress records and family communication — into one place.

Set up your learners once. Plan against a structured curriculum. Record work
and progress as it happens. Share what matters with the people who need to see
it.
```

### 1.2 `home.learning-options`
- **title:** Two ways to learn with LearnFlow
- **summary:** Choose full-time homeschooling or part-time supplementary tuition.
- **bodyMarkdown:**

```
**Full-time homeschooling.** Your learner's whole school programme runs on
LearnFlow: curriculum enrollment, planning, assignments, assessment and
progress records in one continuous record.

**Part-time tuition.** Supplementary support alongside an existing school. Use
LearnFlow for the subjects and periods you need, without duplicating the rest.

Both options use the same curriculum structure and the same progress records,
so a learner can move between them without losing history.
```

### 1.3 `home.who-we-support`
- **title:** Who LearnFlow supports
- **summary:** Families, tutors, learning centres, academies, small schools and education organizations.
- **bodyMarkdown:**

```
- **Homeschooling families** — plan, teach and keep an orderly record of each child's learning.
- **Tutors** — manage learners across households with clear relationships and permissions.
- **Learning centres and academies** — run several groups under one organization.
- **Small and private schools** — staff, learners and curriculum in a single tenant.
- **Education organizations and NGOs** — support learners across multiple settings.

Each organization's data is separated at the database level, so one tenant
never sees another tenant's learners, work or records.
```

### 1.4 `home.how-it-works`
- **title:** How it works
- **summary:** Four steps from account to recorded progress.
- **bodyMarkdown:**

```
1. **Create your organization.** A family, tutoring practice, centre or school.
2. **Add learners and the adults around them.** Parents, guardians, teachers
   and tutors are linked to learners through explicit relationships, so access
   is always deliberate.
3. **Choose a curriculum pathway.** Enroll each learner at the right level and
   subject set. Availability of a given curriculum depends on verified
   publication rights.
4. **Teach and record.** Plan lessons, set assignments, run assessments and
   keep progress visible to the people entitled to see it.
```

### 1.5 `home.why-learnflow`
- **title:** Why LearnFlow
- **summary:** Structure, privacy and one continuous record.
- **bodyMarkdown:**

```
**One continuous record.** Planning, work and results live together, so a
learner's history is not scattered across documents and chat threads.

**Deliberate access.** Every adult sees a learner only through a recorded
relationship or role. Permissions are enforced by the database, not only by the
interface.

**Built for how alternative education actually runs.** Multiple roles per
person, learners in more than one setting, and full-time or part-time study are
normal cases here, not workarounds.

**Accessible by design.** Readable typography, keyboard navigation, visible
focus and reduced-motion support across the platform, with stronger contrast on
learning content.
```

### 1.6 `home.get-started`
- **title:** Talk to us about your setup
- **summary:** Book a consultation, or sign in if you already have an account.
- **bodyMarkdown:**

```
Tell us who you are teaching and how you work today, and we will walk you
through whether LearnFlow fits. Use **Book a consultation** to request a
conversation, or **Contact** for a written question.
```

---

## 2. `site_content` — About (`pageSlug: about`)

### 2.1 `about.what-we-are` — displayOrder 10
- **title:** About LearnFlow
- **summary:** A school-level education platform for homeschools, tutors and small institutions.
- **bodyMarkdown:**

```
LearnFlow is software for running school-level education outside — or alongside
— a conventional school. It covers Grades 1 to 12 and the people involved in
them: learners, parents and guardians, teachers, tutors and administrators.

We build the administrative and record-keeping layer. The teaching remains
yours.
```

### 2.2 `about.what-we-believe` — displayOrder 20
- **title:** What we believe
- **summary:** Structure should support teaching, not replace it.
- **bodyMarkdown:**

```
- Families and educators know their learners; software should make their work
  easier to organize, not dictate it.
- A learner's record belongs to the learner and the adults responsible for
  them, and should be portable across settings.
- Privacy is a default, not a setting. Data about children is handled narrowly
  and deliberately.
- Clear structure — curriculum, levels, subjects, objectives — makes progress
  legible without turning learning into paperwork.
```

### 2.3 `about.scope` — displayOrder 30
- **title:** What LearnFlow covers, and what it does not
- **summary:** School-level education only.
- **bodyMarkdown:**

```
LearnFlow supports school-level education: Grades 1 to 12.

It does not cover university, TVET or other post-school study, and it does not
issue certificates, qualifications or credentials. Where a curriculum pathway is
offered, its availability depends on verified publication rights; a pathway that
has not been verified is not shown as available.
```

---

## 3. `site_content` — Why Choose Us (`pageSlug: why-choose-us`)

### 3.1 `why.built-for-alternative-education` — displayOrder 10
- **title:** Built for alternative education, not adapted to it
- **summary:** Multi-role, multi-setting and part-time study are first-class cases.
- **bodyMarkdown:**

```
Most school software assumes one school, one timetable and one role per person.
Homeschools, tutors and learning centres rarely look like that. In LearnFlow a
person can be a parent and a teacher, a learner can study full-time or
part-time, and an organization can run several groups — without duplicate
accounts or parallel spreadsheets.
```

### 3.2 `why.privacy-and-access` — displayOrder 20
- **title:** Access you can explain
- **summary:** Relationships and roles decide what each person sees.
- **bodyMarkdown:**

```
Access follows recorded relationships: parent to learner, teacher to learner,
tutor to learner, and membership of an organization. Those rules are enforced in
the database itself, so hiding a button is never the only thing standing between
someone and a child's record. Inactive or revoked memberships grant nothing.
```

### 3.3 `why.records` — displayOrder 30
- **title:** Records that hold up
- **summary:** Planning, work, assessment and progress in one place.
- **bodyMarkdown:**

```
Lesson plans, assignments, submissions, assessment results and progress notes
stay connected to the curriculum they belong to. When you need to show what a
learner has covered — to a parent, a tutor or yourself at the end of a term —
the answer is already assembled.
```

### 3.4 `why.accessible` — displayOrder 40
- **title:** Usable on the devices people actually have
- **summary:** Mobile-first, keyboard-friendly, high contrast on learning content.
- **bodyMarkdown:**

```
LearnFlow is designed for a phone first and scales up to a laptop. Targets are
large enough to tap, focus is always visible for keyboard users, motion can be
reduced, and reading surfaces used for learning content are held to a stricter
contrast standard than ordinary administrative screens.
```

---

## 4. `site_content` — Services (`pageSlug: services`)

### 4.1 `services.full-time` — displayOrder 10
- **title:** Full-time homeschooling
- **summary:** A learner's complete school programme on LearnFlow.
- **bodyMarkdown:**

```
Enroll a learner at their level, plan across subjects, set and mark work, and
keep a continuous progress record for the whole year. Parents and guardians see
their own children; teachers and tutors see the learners they are linked to.
```

### 4.2 `services.part-time` — displayOrder 20
- **title:** Part-time and supplementary tuition
- **summary:** Support for specific subjects alongside an existing school.
- **bodyMarkdown:**

```
Use LearnFlow for the subjects where a learner needs extra support. Sessions,
assignments and results are recorded against the same curriculum structure, so
the supplementary work sits in context rather than in isolation.
```

### 4.3 `services.organizations` — displayOrder 30
- **title:** For tutors, centres and schools
- **summary:** Run an organization with staff, learners and shared curriculum.
- **bodyMarkdown:**

```
An organization account adds administrators, staff membership, learner groups
and organization-wide oversight. Administrators control who may author content
for the tenant, and every record stays inside that tenant.
```

### 4.4 `services.extracurricular` — displayOrder 40
- **title:** Extracurricular programmes
- **summary:** Clubs and activities alongside academic study.
- **bodyMarkdown:**

```
Organizations can run programmes outside the academic timetable — academic
support, languages, arts, music, STEM, sport, technology, life skills and
general enrichment — with instructors, optional capacity limits, a schedule
description and enrollment that is tracked to completion.

Programmes are an internal record of participation. LearnFlow does not issue
certificates for them.
```

### 4.5 `services.curriculum-pathways` — displayOrder 50
- **title:** Curriculum pathways
- **summary:** Structured pathways, offered only where publication rights are verified.
- **bodyMarkdown:**

```
LearnFlow's curriculum model supports Kenya CBC/CBE (Grades 1–12: Primary 1–6,
Junior Secondary 7–9, Senior Secondary 10–12), Cambridge International, Pearson
Edexcel and a generic American K–12 pathway.

Each pathway is structured as provider, curriculum, version, stage, level,
subject, curriculum nodes and learning objectives. A pathway becomes selectable
only once its content is complete, current and covered by verified publication
rights. Ask us which pathways are available for your situation.
```

---

## 5. `guide_articles` — initial set

All: **status** published. Tags are free text; keep them short.

### 5.1
- **slug:** `what-is-homeschooling`
- **title:** What homeschooling actually involves
- **summary:** A plain look at the work, the rhythm and the record-keeping behind home-based education.
- **category:** `getting-started`
- **tags:** `homeschooling`, `getting started`
- **readingMinutes:** 5
- **seoDescription:** A practical introduction to homeschooling: planning, daily rhythm, record-keeping and the support families usually need.
- **displayOrder:** 10
- **bodyMarkdown:**

```
Homeschooling means the family takes responsibility for a child's school-level
education, usually at home and often with outside help for particular subjects.

## The four things you will actually do

**Decide on a curriculum pathway.** This sets the levels, subjects and learning
objectives you are working towards, and makes progress measurable.

**Plan the year, then the week.** Most families work backwards: the subjects for
the year, the topics for the term, then a weekly rhythm they can sustain.

**Teach and set work.** Some of this is direct teaching, some is independent
work, and some is outsourced to a tutor or a group class.

**Keep records.** What was covered, what was submitted, how the learner did.
Records matter when a child moves between settings, when another adult takes
over a subject, or simply when you want to see progress honestly.

## What tends to be hardest

Consistency, not capability. Families rarely struggle to teach; they struggle
to keep the planning and records going for a full year. Reducing the
administrative load is where a platform helps most.

## Getting support

You do not have to do everything yourself. Tutors, learning centres and
co-operative groups can take specific subjects while you keep oversight of the
whole programme.
```

### 5.2
- **slug:** `choosing-a-curriculum-pathway`
- **title:** How to choose a curriculum pathway
- **summary:** What to weigh when deciding which curriculum your learner should follow.
- **category:** `curriculum`
- **tags:** `curriculum`, `planning`
- **readingMinutes:** 6
- **seoDescription:** Questions to work through when choosing a curriculum pathway for a homeschooled or tutored learner.
- **displayOrder:** 20
- **bodyMarkdown:**

```
A curriculum pathway decides the structure of your learner's next few years, so
it is worth a deliberate decision rather than a default.

## Questions worth answering first

**Where might this learner go next?** If a return to a local school is likely,
alignment with that system's levels and subjects reduces friction later.

**How structured do you want to be?** Some pathways prescribe content tightly;
others leave more to the teacher. Neither is better in the abstract.

**What can you resource?** Consider the subjects you can teach, the ones you
will outsource, and any practical work that needs equipment or a group.

**What does your learner need right now?** A learner who is behind in one
subject and ahead in another is normal. A pathway should tolerate that.

## Practical advice

Choose one pathway and stay with it long enough to judge it — usually a full
year. Switching mid-year costs more than most families expect, because
sequencing differs even when subject names match.

## Availability

In LearnFlow, a pathway can only be selected once its content is complete and
its publication rights are verified. If a pathway you want is not selectable
yet, contact us and we will tell you its exact status.
```

### 5.3
- **slug:** `planning-a-homeschool-week`
- **title:** Planning a homeschool week that survives contact with reality
- **summary:** A simple weekly planning method that leaves room for interruptions.
- **category:** `planning`
- **tags:** `planning`, `routine`
- **readingMinutes:** 4
- **seoDescription:** A straightforward weekly planning method for homeschooling families, built around fixed blocks and deliberate slack.
- **displayOrder:** 30
- **bodyMarkdown:**

```
Most homeschool plans fail for the same reason: they assume a perfect week.

## Start with blocks, not hours

Divide the day into two or three blocks rather than timetabled periods. Put the
subjects that need the most attention in the block where your learner is
sharpest — for many children that is the first one.

## Fix a few anchors

Choose three or four fixed points in the week: a tutor session, a group class,
a science practical, a weekly review. Everything else moves around them.

## Leave one empty block

Plan four days of content into five days of time. The spare block absorbs
illness, appointments and the topic that took twice as long. If it is not
needed, it becomes reading, a project or a day out.

## Review weekly, in writing

Ten minutes at the end of the week: what was covered, what slipped, what moves
to next week. Written down, this is also your progress record.
```

### 5.4
- **slug:** `keeping-good-learning-records`
- **title:** Keeping learning records you will actually be glad to have
- **summary:** What to record, how often, and why it matters later.
- **category:** `records`
- **tags:** `records`, `assessment`
- **readingMinutes:** 5
- **seoDescription:** What to record in home-based education — coverage, work, assessment and progress — and how to keep it sustainable.
- **displayOrder:** 40
- **bodyMarkdown:**

```
Records are not bureaucracy. They are how you answer, months later, what a
learner has actually covered and how well.

## Record four things

**Coverage** — which objectives or topics were taught, and when.
**Work** — assignments set and submitted, with dates.
**Assessment** — results, with enough context to interpret them.
**Observations** — short notes on difficulty, confidence and effort.

## Keep it light enough to sustain

A sentence per subject per week beats a detailed report you abandon in March.
Record as you go rather than reconstructing at the end of a term.

## Why it pays off

Records make handovers possible — to a tutor, a co-teaching parent or a school.
They let you see a trend rather than a single bad day. And they protect the
learner, because decisions about their education rest on evidence.
```

### 5.5
- **slug:** `working-with-a-tutor`
- **title:** Working with a tutor without losing the thread
- **summary:** How to bring in outside teaching while keeping one coherent programme.
- **category:** `support`
- **tags:** `tutoring`, `collaboration`
- **readingMinutes:** 4
- **seoDescription:** Practical guidance on using tutors for part of a homeschool programme while keeping planning and records coherent.
- **displayOrder:** 50
- **bodyMarkdown:**

```
Bringing in a tutor is normal and sensible. The risk is that the tutored subject
drifts into a separate programme with its own plan, its own records and no
visibility for anyone else.

## Agree the scope in writing

Which subject, which objectives, over what period, and what counts as done.

## Share the same structure

Have the tutor work against the same curriculum objectives you are already
using, and record work in the same place. Two parallel records become
contradictory quickly.

## Set a review rhythm

A short monthly check — coverage, results, concerns — is usually enough. It is
much easier than reconstructing a term in June.

## Keep access deliberate

A tutor should see the learners they teach and nothing else. In LearnFlow that
is what a tutor-learner relationship grants, and revoking it removes the access.
```

---

## 6. `faqs`

All: **status** published.

| # | question | category | displayOrder | answerMarkdown |
|---|---|---|---|---|
| 1 | Who is LearnFlow for? | general | 10 | Homeschooling families, tutors, learning centres, academies, small and private schools, and education organizations working with school-level learners in Grades 1 to 12. |
| 2 | Which curriculum pathways does LearnFlow support? | curriculum | 20 | The platform's curriculum model supports Kenya CBC/CBE (Grades 1–12), Cambridge International, Pearson Edexcel and a generic American K–12 pathway. A pathway becomes selectable only once its content is complete, current and covered by verified publication rights, so ask us about the current status for your situation. |
| 3 | Does LearnFlow cover pre-primary, university or TVET? | curriculum | 30 | No. LearnFlow covers school-level education only, Grades 1 to 12. Pre-primary levels, university, TVET and other post-school study are outside its scope. |
| 4 | Does LearnFlow issue certificates or qualifications? | general | 40 | No. LearnFlow does not issue certificates, qualifications or credentials of any kind, and is not an awarding body. It records what a learner has covered and how they performed; formal qualifications come from the relevant examining body. |
| 5 | Can one person hold more than one role? | accounts | 50 | Yes. A person can be, for example, both a parent and a teacher. Roles are recorded separately and each one grants only its own access. |
| 6 | How is my family's data kept separate from other organizations? | privacy | 60 | Each organization's data is isolated at the database level, and access rules are enforced there rather than only in the interface. A person sees a learner only through a recorded relationship or role, and an inactive or revoked membership grants nothing. |
| 7 | Can a learner study part-time while attending another school? | learning | 70 | Yes. Part-time supplementary study uses the same curriculum structure and the same progress records as a full-time programme, so work done with LearnFlow sits in context. |
| 8 | What do I need to get started? | getting-started | 80 | A device with a web browser and an internet connection, the learners you want to add, and a sense of which subjects you will teach yourself and which you will outsource. Book a consultation and we will talk it through. |
| 9 | Does LearnFlow work on a phone? | technical | 90 | Yes. The platform is designed for a phone first and works up to a full desktop screen, with keyboard navigation, visible focus and reduced-motion support throughout. |
| 10 | How do I get help? | support | 100 | Use the Contact page for a written question, or Book a consultation for a conversation about your setup. |

---

## 7. `testimonials` — intentionally empty

No genuine LearnFlow testimonial with documented publication permission exists.
Publish nothing here. The public page's empty state is the truthful result.

## 8. `merchandise_items` — intentionally empty

No actual LearnFlow product with a verified price, currency and availability
exists. Publish nothing here.

---

## After publication — anonymous verification checklist

In a private browsing window, signed out:

1. `/`, `/about`, `/why-choose-us`, `/services`, `/guide`, `/faqs` show the published content.
2. A record left as **draft** does not appear on the public page.
3. A record set to **archived** disappears from the public page.
4. Sections appear in `displayOrder` order.
5. Markdown renders as formatted text; no raw HTML or script executes.
6. In the administrator interface, each record shows the publishing administrator and publication timestamp.
7. `/testimonials` and `/merchandise` still show their empty states.
8. No learner, tenant or private information appears anywhere on the public site.
