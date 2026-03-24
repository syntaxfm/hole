<script lang="ts">
	import { db } from '$lib/instant/client';
	import { adminDriveQuery } from '$lib/instant/queries';
	import {
		buildAdvanceQuestionTx,
		buildClosePollTx,
		buildLockQuestionTx,
		buildRecomputeQuestionStatsTx,
		buildRevealQuestionTx,
		buildStartPollTx
	} from '$lib/instant/transactions';

	let { params } = $props();

	const pollId = $derived(params.pollId);
	const auth = db.useAuth();
	const query = db.useQuery(() => (auth.user ? adminDriveQuery(pollId, auth.user.id) : null));

	const poll = $derived((query.data?.polls?.[0] ?? null) as Record<string, any> | null);
	const questions = $derived((poll?.questions ?? []) as Array<Record<string, any>>);
	const sortedQuestions = $derived(
		[...questions].sort((a, b) => Number(a.order) - Number(b.order))
	);
	const activeQuestion = $derived(
		sortedQuestions.find((question) => question.id === poll?.activeQuestionId) ?? null
	);
	const participantSessions = $derived(
		(query.data?.participant_sessions ?? []) as Array<Record<string, any>>
	);
	const votes = $derived((query.data?.votes ?? []) as Array<Record<string, any>>);

	const activeVotes = $derived(
		activeQuestion
			? votes.filter((vote) => vote.questionId === activeQuestion.id)
			: ([] as Array<Record<string, any>>)
	);
	const activeVoteSignature = $derived(
		activeVotes
			.map((vote) => `${vote.id}:${vote.answerId}:${vote.updatedAt}`)
			.sort()
			.join('|')
	);

	const respondedCount = $derived(
		participantSessions.filter(
			(session) =>
				session.activeQuestionId === activeQuestion?.id && Boolean(session.hasVotedActive)
		).length
	);

	let pendingAction = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let isRecomputingStats = $state(false);
	let lastStatsRecomputeKey = $state<string | null>(null);

	$effect(() => {
		if (!poll || !activeQuestion || isRecomputingStats) return;

		const recomputeKey = `${poll.id}:${activeQuestion.id}:${activeVoteSignature}`;
		if (lastStatsRecomputeKey === recomputeKey) return;

		lastStatsRecomputeKey = recomputeKey;
		isRecomputingStats = true;

		const answerIds = getAnswerIds(activeQuestion);
		const voteSnapshot = activeVotes.map((vote) => ({ answerId: String(vote.answerId) }));

		void (async () => {
			try {
				await db.transact(
					buildRecomputeQuestionStatsTx({
						pollId: poll.id,
						questionId: activeQuestion.id,
						pollOwnerId: poll.ownerId,
						answerIds,
						votes: voteSnapshot
					})
				);
			} finally {
				isRecomputingStats = false;
			}
		})();
	});

	async function runAction(actionLabel: string, buildTx: () => Array<any>) {
		pendingAction = actionLabel;
		actionError = null;
		try {
			await db.transact(buildTx());
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Action failed.';
		} finally {
			pendingAction = null;
		}
	}

	async function startPoll() {
		if (!poll || !sortedQuestions.length) return;
		const firstQuestion = sortedQuestions[0];

		await runAction('start', () =>
			buildStartPollTx({
				pollId: poll.id,
				firstQuestionId: firstQuestion.id,
				firstOrder: Number(firstQuestion.order)
			})
		);
	}

	async function lockQuestion() {
		if (!poll) return;
		await runAction('lock', () => buildLockQuestionTx({ pollId: poll.id }));
	}

	async function revealAnswers() {
		if (!poll || !activeQuestion) return;

		const answerIds = getAnswerIds(activeQuestion);
		const voteSnapshot = votes
			.filter((vote) => vote.questionId === activeQuestion.id)
			.map((vote) => ({ answerId: String(vote.answerId) }));

		await runAction('reveal', () => [
			...buildRecomputeQuestionStatsTx({
				pollId: poll.id,
				questionId: activeQuestion.id,
				pollOwnerId: poll.ownerId,
				answerIds,
				votes: voteSnapshot,
				revealedAt: Date.now()
			}),
			...buildRevealQuestionTx({
				pollId: poll.id,
				questionId: activeQuestion.id
			})
		]);
	}

	async function nextQuestion() {
		if (!poll || !activeQuestion) return;

		const currentIndex = sortedQuestions.findIndex((question) => question.id === activeQuestion.id);
		const next = currentIndex >= 0 ? sortedQuestions[currentIndex + 1] : null;
		if (!next) return;

		await runAction('next', () =>
			buildAdvanceQuestionTx({
				pollId: poll.id,
				currentQuestionId: activeQuestion.id,
				nextQuestionId: next.id,
				nextOrder: Number(next.order),
				participantSessionIdsToReset: participantSessions.map((session) => session.id)
			})
		);
	}

	async function closePoll() {
		if (!poll) return;
		await runAction('close', () =>
			buildClosePollTx({
				pollId: poll.id,
				currentQuestionId: activeQuestion?.id
			})
		);
	}

	function getQuestionStats(question: Record<string, any> | null) {
		if (!question?.stats) return null;
		return Array.isArray(question.stats) ? question.stats[0] : question.stats;
	}

	function getAnswerIds(question: Record<string, any>): string[] {
		return (question.answers ?? []).map((answer: Record<string, any>) => String(answer.id));
	}

	function answerCount(question: Record<string, any>, answerId: string): number {
		const stats = getQuestionStats(question);
		const counts = (stats?.countsByAnswer ?? {}) as Record<string, number>;
		return Number(counts[answerId] ?? 0);
	}
</script>

{#if auth.isLoading}
	<p>Checking auth…</p>
{:else if !auth.user}
	<p>Sign in to access this page.</p>
{:else if query.isLoading}
	<p>Loading poll data…</p>
{:else if query.error}
	<p class="error">{query.error.message}</p>
{:else if !poll}
	<div class="card">
		<h3>Poll not found</h3>
		<p>You may not own this poll, or the id is invalid.</p>
	</div>
{:else}
	<section class="card status-grid">
		<div>
			<h3>{poll.title}</h3>
			<p class="meta">Status: {poll.status} · Phase: {poll.activePhase}</p>
		</div>
		<div>
			<p class="meta">Participants connected: {participantSessions.length}</p>
			<p class="meta">Answered current: {respondedCount}</p>
		</div>
	</section>

	<section class="card actions">
		<button disabled={pendingAction !== null || !sortedQuestions.length} onclick={startPoll}>
			{pendingAction === 'start' ? 'Starting…' : 'Start / restart'}
		</button>
		<button
			disabled={pendingAction !== null || !activeQuestion || poll.activePhase !== 'collecting'}
			onclick={lockQuestion}
		>
			{pendingAction === 'lock' ? 'Locking…' : 'Lock in'}
		</button>
		<button
			disabled={pendingAction !== null || !activeQuestion || poll.activePhase === 'revealed'}
			onclick={revealAnswers}
		>
			{pendingAction === 'reveal' ? 'Revealing…' : 'Reveal answers'}
		</button>
		<button disabled={pendingAction !== null || !activeQuestion} onclick={nextQuestion}>
			{pendingAction === 'next' ? 'Advancing…' : 'Next question'}
		</button>
		<button class="danger" disabled={pendingAction !== null} onclick={closePoll}>
			{pendingAction === 'close' ? 'Closing…' : 'Close poll'}
		</button>
	</section>

	<section class="card">
		<h3>Questions</h3>
		<div class="question-list">
			{#each sortedQuestions as question (question.id)}
				<article class:active={question.id === activeQuestion?.id}>
					<div class="heading">
						<strong>Q{question.order}</strong>
						<span>{question.text}</span>
						<small>{question.status}</small>
					</div>

					<div class="answers">
						{#each question.answers ?? [] as answer (answer.id)}
							<div class="answer-row">
								<span>{answer.text}</span>
								<span>{answerCount(question, answer.id)}</span>
							</div>
						{/each}
					</div>
				</article>
			{/each}
		</div>
	</section>
{/if}

{#if actionError}
	<p class="error">{actionError}</p>
{/if}

<style>
	.card {
		padding: 1rem;
		border-radius: 0.85rem;
		border: 1px solid color-mix(in srgb, canvastext 14%, transparent);
		display: grid;
		gap: 0.8rem;
	}

	h3,
	p {
		margin: 0;
	}

	.meta {
		opacity: 0.75;
		font-size: 0.93rem;
	}

	.status-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
		gap: 0.9rem;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	button {
		padding: 0.58rem 0.85rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, canvastext 18%, transparent);
		background: canvas;
		font: inherit;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	button.danger {
		border-color: color-mix(in srgb, #d11f4f 60%, transparent);
		color: #d11f4f;
	}

	.question-list {
		display: grid;
		gap: 0.8rem;
	}

	article {
		border: 1px solid color-mix(in srgb, canvastext 10%, transparent);
		border-radius: 0.75rem;
		padding: 0.7rem;
		display: grid;
		gap: 0.55rem;
	}

	article.active {
		border-color: color-mix(in srgb, #5a67ff 60%, transparent);
		background: color-mix(in srgb, #5a67ff 10%, canvas 90%);
	}

	.heading {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}

	.heading strong {
		font-size: 0.82rem;
		opacity: 0.75;
	}

	.heading small {
		opacity: 0.7;
		text-transform: uppercase;
		font-size: 0.74rem;
	}

	.answers {
		display: grid;
		gap: 0.35rem;
	}

	.answer-row {
		display: flex;
		justify-content: space-between;
		gap: 0.55rem;
		font-size: 0.92rem;
	}

	.error {
		color: #d11f4f;
		font-weight: 600;
	}
</style>
