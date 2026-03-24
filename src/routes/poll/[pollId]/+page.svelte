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
	<p class="text-muted">Checking your session…</p>
{:else if !auth.user}
	<div class="callout stack">
		<p><strong>Join this poll</strong></p>
		<p>Sign in as a guest to vote anonymously.</p>
		<div class="cluster">
			<button class="button primary" disabled={isSigningIn} onclick={signInAsGuest}>
				{isSigningIn ? 'Joining…' : 'Join as guest'}
			</button>
		</div>
	</div>
{:else if query.isLoading}
	<p class="text-muted">Loading poll…</p>
{:else if query.error}
	<div class="callout error">
		<p>{query.error.message}</p>
	</div>
{:else if !poll}
	<div class="callout warning">
		<p><strong>Poll unavailable</strong></p>
		<p>This poll doesn't exist or is not visible yet.</p>
	</div>
{:else}
	<section class="layout-card">
		<article class="stat-card">
			<small>Poll</small>
			<strong>{poll.title}</strong>
		</article>
		<article class="stat-card">
			<small>Status</small>
			<strong>{poll.status}</strong>
		</article>
		<article class="stat-card">
			<small>Phase</small>
			<strong>{poll.activePhase}</strong>
		</article>
	</section>

	{#if activeQuestion}
		<section class="box">
			<div class="stack">
				<div class="stack">
					<h3 class="h5 no-margin">Question {activeQuestion.order}</h3>
					<p class="no-margin">{activeQuestion.text}</p>
				</div>

				<div class="stack" role="radiogroup" aria-label="Answer choices">
					{#each activeQuestion.answers ?? [] as answer (answer.id)}
						<button
							type="button"
							class={`button full ${selectedAnswerId === answer.id ? 'primary' : 'ghost'}`}
							onclick={() => {
								selectedAnswerId = answer.id;
							}}
						>
							<span class="split full">
								<span>{answer.text}</span>
								{#if revealFullResults}
									<small>{answerCount(answer.id)} votes</small>
								{/if}
							</span>
						</button>
					{/each}
				</div>

				<div class="cluster">
					<button
						class="button primary"
						disabled={!canVote || !selectedAnswerId || isCastingVote}
						onclick={castVote}
					>
						{#if isCastingVote}
							Submitting…
						{:else if myActiveVote}
							Update vote
						{:else}
							Submit vote
						{/if}
					</button>

					{#if !canVote}
						<span class="tag muted">Voting is currently locked.</span>
					{/if}
				</div>
			</div>
		</section>

		<section class="box">
			<div class="stack">
				<h3 class="h5 no-margin">Participation</h3>
				<p class="no-margin">{activeStats?.totalVotes ?? 0} responses received</p>
				{#if revealFullResults}
					<p class="text-muted no-margin">Answer breakdown is now visible.</p>
				{:else}
					<p class="text-muted no-margin">Answer choices stay hidden until reveal.</p>
				{/if}
			</div>
		</section>
	{:else}
		<div class="callout info">
			<p><strong>Waiting for the host</strong></p>
			<p>The next question will appear here once it's live.</p>
		</div>
	{/if}
{/if}

{#if errorMessage}
	<div class="callout error">
		<p>{errorMessage}</p>
	</div>
{/if}
