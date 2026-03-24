# InstantDB Transactions + Query Shapes

This file maps route behavior to concrete helpers in `src/lib/instant`.

## Files

- `src/lib/instant/client.ts`
  - Typed Instant client initialization (`db`)
- `src/lib/instant/transactions.ts`
  - Write helpers for poll creation, voting, drive actions
- `src/lib/instant/queries.ts`
  - Route-focused query builders for participant, admin, and embed screens

## Transaction helpers

### Poll authoring

- `buildCreatePollTx(input)`
  - creates poll + questions + answers + initial `question_stats`
  - returns `{ pollId, questionIds, answerIdsByQuestionId, tx }`
- `createPoll(input)`
  - executes `buildCreatePollTx` via `db.transact`
- `buildAddQuestionTx(input)`
  - adds one queued question + answers + initial stats

### Participant lifecycle

- `buildCreateParticipantSessionTx(input)`
  - creates participant session row and links
- `buildTouchParticipantSessionTx(input)`
  - updates `lastSeenAt`, `activeQuestionId`, `hasVotedActive`

### Voting

- `buildCastOrRevoteTx(input)`
  - first vote = create vote + links
  - revote = strict update on existing vote (`upsert: false`)
  - optional participant session touch

### Stats

- `buildRecomputeQuestionStatsTx(input)`
  - recomputes `countsByAnswer` from a fresh votes snapshot
  - writes `totalVotes` + `countsByAnswer` + `updatedAt`

### Drive mode

- `buildStartPollTx(input)`
- `buildLockQuestionTx(input)`
- `buildRevealQuestionTx(input)`
- `buildAdvanceQuestionTx(input)`
- `buildClosePollTx(input)`

## Query builders

### Participant route (`/poll/[pollId]`)

- `participantPollQuery(pollId, viewerId)`
  - poll state + ordered questions/answers/stats
  - viewer's participant session
  - viewer's own votes

### Admin drive (`/admin/poll/[pollId]/drive`)

- `adminDriveQuery(pollId, ownerId)`
  - poll + ordered questions/answers/stats
  - participant sessions (for attendance/progress)
  - recent votes feed

### Embeds

- `embedLivePollQuery(pollId)` (`/embed/poll/[pollId]`)
- `embedQuestionQuery(pollId, questionId)` (`/embed/poll/[pollId]/[questionId]`)

## Suggested route wiring pattern

1. Use query builder in `db.useQuery(...)` per route.
2. Build transaction chunks from helper and call `db.transact(tx)`.
3. After vote writes, trigger a stats recompute in admin/driver flow for eventual consistency.

## Notes

- `voterQuestionKey(voterId, questionId)` and `pollUserKey(pollId, userId)` are exported for deterministic keys.
- Aggregated results are in `question_stats`; authoritative per-user vote records are in `votes`.
