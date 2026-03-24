# Realtime Polling MVP Plan (Pigeonhole-lite)

## 1) Product goal

Build a pared-down live polling product (similar to Pigeonhole) with:

- realtime multiple choice voting
- admin drive mode
- embeddable live results
- anonymous participant voting via QR code

## 2) Architecture approach (confirmed)

- **Frontend/App:** SvelteKit (Cloudflare adapter)
- **Realtime/data/auth/permissions:** InstantDB
- **UI:** Graffiti UI
- **Hosting:** Cloudflare Workers

### Important architecture note

This app is **client-first with InstantDB**:

- no traditional CRUD REST endpoints needed for core entities
- minimal/no custom server-side app logic
- auth and permission rules are enforced via InstantDB

## 3) Confirmed product decisions

- Auth provider for launch: **InstantDB auth**
- Revotes: **allowed while question is open/collecting**
- Lock behavior: when admin clicks **Locked in** (or equivalent), no more revotes for that question
- Participant live visibility default: **hide answer breakdown**, but show participation progress/count
- Embeds: **public** for this project phase

## 4) MVP scope

### In scope

- Admin creates and edits polls
- Poll has one or more multiple-choice questions
- Admin drives the session (open/lock/reveal/next)
- Anonymous users join and vote
- Live results update in admin + embed view
- QR code to participant join URL

### Out of scope (v2+)

- Q&A/upvotes
- open text responses
- moderation tools
- multi-tenant org billing
- advanced analytics exports

## 5) Roles

### Admin

- create/update poll
- manage questions and answers
- run live drive view
- access join + embed links

### Participant (anonymous)

- open poll link
- vote on active question
- revote only while question is collecting

### Embed viewer

- read-only live result visual
- optimized for iframe in slides

## 6) Route map

```txt
/poll/[pollId]                        # participant voting page
/poll/[pollId]/results                # optional participant results screen

/embed/poll/[pollId]                  # public iframe live results
/embed/poll/[pollId]/[questionId]     # optional fixed-question embed

/admin/poll/new                       # create poll
/admin/poll/[pollId]/edit             # edit poll/questions/options
/admin/poll/[pollId]/drive            # live controls + QR + presenter view
```

> If InstantDB auth UI needs a dedicated route, add `/admin/login` as a thin auth screen.

## 7) Poll progression model (recommended)

### Active question API: `activeQuestionId` vs `activeOrder`

**Recommendation:** keep `activeQuestionId` as source of truth, and derive/display step/order in UI.

Why this is better than only `activeOrder`:

- IDs are stable even if question order changes
- vote writes and locks naturally reference question IDs
- avoids off-by-one and reorder edge cases

Use this shape in app state/helpers:

- `activeQuestionId` (canonical)
- `activeStep` (derived from active question `order`, for UI: “Question 3 of 8”)

### Drive phase/state machine

For the current active question:

- `collecting` → participants can vote/revote
- `locked` → voting closed, counts frozen
- `revealed` → answer breakdown can be shown

Admin actions:

1. Start/open question (`collecting`)
2. Lock in (`locked`)
3. Reveal answers (`revealed`)
4. Next question (set new `activeQuestionId`, phase=`collecting`)

## 8) Data model (InstantDB)

## `polls`

- `id`
- `title`
- `status` (`draft | live | closed`)
- `activeQuestionId` (nullable, canonical pointer)
- `activePhase` (`collecting | locked | revealed`)
- `allowRevoteWhileCollecting` (boolean, default `true`)
- `participantResultsMode` (`count_only | full`, default `count_only`)
- `isEmbedPublic` (boolean, default `true`)
- `createdBy`
- `createdAt`, `updatedAt`

## `questions`

- `id`
- `pollId`
- `text`
- `order` (step number)
- `status` (`queued | active | done`)

## `answers`

- `id`
- `questionId`
- `text`
- `order`
- `color` (optional)

## `participants`

- `id`
- `pollId`
- `instantUserId` (nullable if anonymous mode)
- `sessionId` (for anonymous identity continuity)
- `joinedAt`

## `votes`

- `id`
- `pollId`
- `questionId`
- `answerId`
- `participantId` (or stable `sessionId` key)
- `updatedAt`

> Vote model should support **upsert while collecting** (revote), then deny writes once locked.

## `question_stats` (recommended for 300 concurrent users)

- `questionId`
- `totalVotes`
- `countsByAnswer` (object/map)
- `updatedAt`

> Result UIs should subscribe to `question_stats` rather than fan out raw `votes` to all clients.

## 9) Auth & permissions (InstantDB)

### Auth

- Use InstantDB auth directly (no custom session cookies required)

### Permissions

- Admin users: create/update polls, questions, answers, drive state
- Participants: can create/update own vote only while active question is `collecting`
- Public embed: read-only access to poll + aggregated stats for public polls

## 10) Realtime behavior

1. Admin sets `activeQuestionId` and `activePhase='collecting'`
2. Participants subscribe to active question + options + participation count
3. Participant vote writes/upserts vote and updates aggregate stats
4. Admin can lock (`activePhase='locked'`) to stop revotes
5. Admin can reveal (`activePhase='revealed'`) to show final breakdown
6. Admin advances to next question

## 11) Participant result visibility behavior

Default participant experience:

- show “how many people answered” (progress/count)
- hide answer distribution while collecting/locked

When reveal is triggered:

- if `participantResultsMode='full'`, show answer breakdown
- if `participantResultsMode='count_only'`, continue showing only count

## 12) 300 concurrent users requirement

**Short answer:** 300 concurrent users is very achievable with this design.

### Throughput expectations

- 300 votes in 10s ≈ 30 writes/sec
- 300 votes in 3s ≈ 100 writes/sec burst

### Performance guardrails

- subscribe to `question_stats` for results
- keep payloads small (active question, answer list, counts)
- enforce one active vote per participant+question (upsert/idempotent key)
- disable repeated rapid submit clicks client-side
- keep embed route read-only/lightweight

## 13) Delivery phases

### Phase 0 — Foundation (0.5–1 day)

- InstantDB project wiring
- auth integration
- base app layout + Graffiti UI tokens

### Phase 1 — Poll authoring (1–2 days)

- create/edit poll
- add/edit/reorder questions and answers

### Phase 2 — Participant voting (1–2 days)

- join route
- active question rendering
- vote upsert + revote while collecting

### Phase 3 — Drive mode (2 days)

- collecting/locked/revealed controls
- next-question flow
- realtime presenter stats

### Phase 4 — Embed + QR + polish (1–2 days)

- public embed route
- QR generation in drive view
- loading/empty/error/mobile polish

### Phase 5 — Validation + deploy (1 day)

- end-to-end flow tests
- 300 concurrent user load validation
- production deploy to Cloudflare

## 14) Definition of done (MVP)

- Admin can run a full poll session end-to-end
- Participants join by URL/QR and vote successfully
- Revote works only while collecting; lock prevents further changes
- Embed reflects live aggregate results
- System validated at 300 concurrent users
- InstantDB auth + permission rules enforce access model
