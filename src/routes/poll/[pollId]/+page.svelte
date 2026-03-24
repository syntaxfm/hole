<script lang="ts">
	import { db } from '$lib/instant/client';
	import { participantPollQuery } from '$lib/instant/queries';
	import {
		buildCastOrRevoteTx,
		buildCreateParticipantSessionTx,
		buildTouchParticipantSessionTx
	} from '$lib/instant/transactions';

	let { params } = $props();

	const pollId = $derived(params.pollId);
	const auth = db.useAuth();
	const query = db.useQuery(() => (auth.user ? participantPollQuery(pollId, auth.user.id) : null));

	const poll = $derived((query.data?.polls?.[0] ?? null) as Record<string, any> | null);
	const questions = $derived((poll?.questions ?? []) as Array<Record<string, any>>);
	const activeQuestion = $derived(
		questions.find((question) => question.id === poll?.activeQuestionId) ?? null
	);
	const activeStats = $derived(getQuestionStats(activeQuestion));
	const participantSession = $derived(
		(query.data?.participant_sessions?.[0] ?? null) as Record<string, any> | null
	);
	const myVotes = $derived((query.data?.votes ?? []) as Array<Record<string, any>>);
	const myActiveVote = $derived(
		myVotes.find((vote) => vote.questionId === activeQuestion?.id) ?? null
	);

	const canVote = $derived(
		Boolean(
			auth.user &&
			poll &&
			activeQuestion &&
			poll.status === 'live' &&
			poll.activePhase === 'collecting'
		)
	);

	const revealFullResults = $derived(
		Boolean(
			poll &&
			(poll.status === 'closed' || poll.activePhase === 'revealed') &&
			poll.participantResultsMode === 'full'
		)
	);

	let selectedAnswerId = $state<string | null>(null);
	let isSigningIn = $state(false);
	let isCastingVote = $state(false);
	let isCreatingSession = $state(false);
	let errorMessage = $state<string | null>(null);
	let sessionQuestionSyncKey = $state<string | null>(null);

	$effect(() => {
		if (myActiveVote?.answerId && selectedAnswerId !== myActiveVote.answerId) {
			selectedAnswerId = myActiveVote.answerId;
		}

		if (!activeQuestion) {
			selectedAnswerId = null;
		}
	});

	$effect(() => {
		const user = auth.user;
		const currentPoll = poll;
		if (!user || !currentPoll || participantSession || isCreatingSession) return;

		isCreatingSession = true;
		void (async () => {
			try {
				const { tx } = buildCreateParticipantSessionTx({
					pollId: currentPoll.id,
					pollOwnerId: currentPoll.ownerId,
					userId: user.id,
					activeQuestionId: currentPoll.activeQuestionId ?? undefined
				});
				await db.transact(tx);
			} catch (error) {
				errorMessage =
					error instanceof Error ? error.message : 'Unable to initialize your participant session.';
			} finally {
				isCreatingSession = false;
			}
		})();
	});

	$effect(() => {
		if (!participantSession || !activeQuestion) return;

		const syncKey = `${participantSession.id}:${activeQuestion.id}:${Boolean(myActiveVote)}`;
		if (sessionQuestionSyncKey === syncKey) return;

		sessionQuestionSyncKey = syncKey;

		void db.transact(
			buildTouchParticipantSessionTx({
				sessionId: participantSession.id,
				activeQuestionId: activeQuestion.id,
				hasVotedActive: Boolean(myActiveVote)
			})
		);
	});

	async function signInAsGuest() {
		isSigningIn = true;
		errorMessage = null;
		try {
			await db.auth.signInAsGuest();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to sign in right now.';
		} finally {
			isSigningIn = false;
		}
	}

	async function castVote() {
		if (!auth.user || !poll || !activeQuestion || !selectedAnswerId) return;

		isCastingVote = true;
		errorMessage = null;
		try {
			await db.transact(
				buildCastOrRevoteTx({
					pollId: poll.id,
					questionId: activeQuestion.id,
					pollOwnerId: poll.ownerId,
					answerId: selectedAnswerId,
					voterId: auth.user.id,
					existingVoteId: myActiveVote?.id,
					participantSessionId: participantSession?.id
				})
			);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to submit vote.';
		} finally {
			isCastingVote = false;
		}
	}

	function getQuestionStats(question: Record<string, any> | null) {
		if (!question?.stats) return null;
		return Array.isArray(question.stats) ? question.stats[0] : question.stats;
	}

	function answerCount(answerId: string): number {
		const counts = (activeStats?.countsByAnswer ?? {}) as Record<string, number>;
		return Number(counts[answerId] ?? 0);
	}
</script>

{#if auth.isLoading}
	<p>Checking your session…</p>
{:else if !auth.user}
	<div class="card">
		<h2>Join this poll</h2>
		<p>Sign in as a guest to vote anonymously.</p>
		<button disabled={isSigningIn} onclick={signInAsGuest}>
			{isSigningIn ? 'Joining…' : 'Join as guest'}
		</button>
	</div>
{:else if query.isLoading}
	<p>Loading poll…</p>
{:else if query.error}
	<p class="error">{query.error.message}</p>
{:else if !poll}
	<div class="card">
		<h2>Poll unavailable</h2>
		<p>This poll doesn't exist or is not visible yet.</p>
	</div>
{:else}
	<div class="card">
		<h2>{poll.title}</h2>
		<p class="meta">Status: {poll.status} · Phase: {poll.activePhase}</p>
	</div>

	{#if activeQuestion}
		<section class="card">
			<h3>Question {activeQuestion.order}</h3>
			<p>{activeQuestion.text}</p>

			<div class="answers" role="radiogroup" aria-label="Answer choices">
				{#each activeQuestion.answers ?? [] as answer (answer.id)}
					<button
						type="button"
						class:selected={selectedAnswerId === answer.id}
						onclick={() => {
							selectedAnswerId = answer.id;
						}}
					>
						<span>{answer.text}</span>
						{#if revealFullResults}
							<small>{answerCount(answer.id)} votes</small>
						{/if}
					</button>
				{/each}
			</div>

			<div class="actions">
				<button disabled={!canVote || !selectedAnswerId || isCastingVote} onclick={castVote}>
					{#if isCastingVote}
						Submitting…
					{:else if myActiveVote}
						Update vote
					{:else}
						Submit vote
					{/if}
				</button>

				{#if !canVote}
					<p class="meta">Voting is currently locked.</p>
				{/if}
			</div>
		</section>

		<section class="card stats">
			<h3>Participation</h3>
			<p>{activeStats?.totalVotes ?? 0} responses received</p>
			{#if revealFullResults}
				<p class="meta">Answer breakdown is now visible.</p>
			{:else}
				<p class="meta">Answer choices stay hidden until reveal.</p>
			{/if}
		</section>
	{:else}
		<div class="card">
			<h3>Waiting for the host</h3>
			<p>The next question will appear here once it's live.</p>
		</div>
	{/if}
{/if}

{#if errorMessage}
	<p class="error">{errorMessage}</p>
{/if}

<style>
	.card {
		padding: 1rem;
		border: 1px solid color-mix(in srgb, canvastext 15%, transparent);
		border-radius: 0.85rem;
		display: grid;
		gap: 0.75rem;
		background: color-mix(in srgb, canvas 92%, canvastext 8%);
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	.meta {
		opacity: 0.72;
		font-size: 0.93rem;
	}

	.answers {
		display: grid;
		gap: 0.6rem;
	}

	.answers button {
		padding: 0.75rem 0.85rem;
		border: 1px solid color-mix(in srgb, canvastext 20%, transparent);
		border-radius: 0.75rem;
		background: canvas;
		text-align: left;
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		align-items: center;
		font: inherit;
		cursor: pointer;
	}

	.answers button.selected {
		border-color: color-mix(in srgb, #5a67ff 60%, canvastext 40%);
		background: color-mix(in srgb, #5a67ff 12%, canvas 88%);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: center;
	}

	.actions button {
		padding: 0.65rem 0.95rem;
		border-radius: 999px;
		border: none;
		background: #5a67ff;
		color: white;
		font: inherit;
		cursor: pointer;
	}

	.actions button:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.stats {
		background: color-mix(in srgb, #5a67ff 8%, canvas 92%);
	}

	.error {
		color: #d11f4f;
		font-weight: 600;
	}
</style>
