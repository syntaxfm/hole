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

	function questionStatusClass(status: string): 'info' | 'warning' | 'success' | 'muted' {
		if (status === 'active') return 'info';
		if (status === 'done') return 'success';
		if (status === 'queued') return 'warning';
		return 'muted';
	}
</script>

{#if auth.isLoading}
	<p class="text-muted">Checking auth…</p>
{:else if !auth.user}
	<div class="callout warning">
		<p>Sign in to access this page.</p>
	</div>
{:else if query.isLoading}
	<p class="text-muted">Loading poll data…</p>
{:else if query.error}
	<div class="callout error">
		<p>{query.error.message}</p>
	</div>
{:else if !poll}
	<div class="callout warning">
		<p><strong>Poll not found</strong></p>
		<p>You may not own this poll, or the id is invalid.</p>
	</div>
{:else}
	<section class="layout-card">
		<article class="stat-card">
			<small>Poll</small>
			<strong>{poll.title}</strong>
			<span class="tag info">{poll.status}</span>
		</article>
		<article class="stat-card">
			<small>Phase</small>
			<strong>{poll.activePhase}</strong>
		</article>
		<article class="stat-card">
			<small>Participants connected</small>
			<strong>{participantSessions.length}</strong>
		</article>
		<article class="stat-card">
			<small>Answered current question</small>
			<strong>{respondedCount}</strong>
		</article>
	</section>

	<section class="box">
		<div class="stack">
			<h3 class="h5 no-margin">Drive controls</h3>
			<div class="cluster">
				<button
					class="button primary"
					disabled={pendingAction !== null || !sortedQuestions.length}
					onclick={startPoll}
				>
					{pendingAction === 'start' ? 'Starting…' : 'Start / restart'}
				</button>
				<button
					class="button"
					disabled={pendingAction !== null || !activeQuestion || poll.activePhase !== 'collecting'}
					onclick={lockQuestion}
				>
					{pendingAction === 'lock' ? 'Locking…' : 'Lock in'}
				</button>
				<button
					class="button"
					disabled={pendingAction !== null || !activeQuestion || poll.activePhase === 'revealed'}
					onclick={revealAnswers}
				>
					{pendingAction === 'reveal' ? 'Revealing…' : 'Reveal answers'}
				</button>
				<button
					class="button"
					disabled={pendingAction !== null || !activeQuestion}
					onclick={nextQuestion}
				>
					{pendingAction === 'next' ? 'Advancing…' : 'Next question'}
				</button>
				<button class="button error" disabled={pendingAction !== null} onclick={closePoll}>
					{pendingAction === 'close' ? 'Closing…' : 'Close poll'}
				</button>
			</div>
		</div>
	</section>

	<section class="stack">
		<h3 class="h5 no-margin">Questions</h3>
		{#each sortedQuestions as question (question.id)}
			<article class={`box ${question.id === activeQuestion?.id ? 'glow' : ''}`}>
				<div class="stack">
					<div class="split">
						<div class="cluster">
							<span class="chip">Q{question.order}</span>
							<strong>{question.text}</strong>
						</div>
						<span class={`tag ${questionStatusClass(String(question.status ?? 'queued'))}`}>
							{question.status}
						</span>
					</div>

					<div class="table">
						<table>
							<thead>
								<tr>
									<th>Answer</th>
									<th class="text-end">Votes</th>
								</tr>
							</thead>
							<tbody>
								{#each question.answers ?? [] as answer (answer.id)}
									<tr>
										<td>{answer.text}</td>
										<td class="text-end">{answerCount(question, answer.id)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</article>
		{/each}
	</section>
{/if}

{#if actionError}
	<div class="callout error">
		<p>{actionError}</p>
	</div>
{/if}
