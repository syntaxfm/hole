<script lang="ts">
	import { db } from '$lib/instant/client';
	import { participantPollQuery } from '$lib/instant/queries';
	import {
		buildCastOrRevoteTx,
		buildCreateParticipantSessionTx,
		buildRevoteByVoteKeyTx,
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

	const canRevote = $derived(Boolean(poll?.allowRevoteWhileCollecting ?? true));
	const canVote = $derived(
		Boolean(
			auth.user &&
			poll &&
			activeQuestion &&
			poll.status === 'live' &&
			poll.activePhase === 'collecting' &&
			(!myActiveVote || canRevote)
		)
	);

	const isPreStart = $derived(Boolean(poll && poll.status === 'draft'));
	const revealFullResults = $derived(
		Boolean(
			poll &&
			poll.participantResultsMode === 'full' &&
			(poll.status === 'closed' || poll.activePhase === 'revealed')
		)
	);
	const voteLockLabel = $derived.by(() => {
		if (!poll) return 'Poll is not available.';
		if (poll.status === 'draft') return 'Starting soon.';
		if (!activeQuestion) return 'Waiting for the next question.';
		if (poll.status === 'closed') return 'This poll is closed.';
		if (poll.activePhase === 'revealed') return 'Voting is closed for this question.';
		if (poll.activePhase !== 'collecting') return 'Voting is currently locked.';
		if (myActiveVote && !canRevote) return 'Revoting is disabled for this poll.';
		return '';
	});

	let selectedAnswerId = $state<string | null>(null);
	let isSigningIn = $state(false);
	let isCastingVote = $state(false);
	let isCreatingSession = $state(false);
	let errorMessage = $state<string | null>(null);
	let sessionQuestionSyncKey = $state<string | null>(null);

	function isUniqueConstraintErrorFor(error: unknown, entity: string, field: string): boolean {
		const message = error instanceof Error ? error.message : String(error ?? '');
		return message.includes('unique attribute') && message.includes(`${entity}.${field}`);
	}

	$effect(() => {
		const currentQuestion = activeQuestion;
		if (!currentQuestion) {
			selectedAnswerId = null;
			return;
		}

		const answerIds = new Set(
			(currentQuestion.answers ?? []).map((answer: Record<string, any>) => String(answer.id))
		);

		if (myActiveVote?.answerId && answerIds.has(String(myActiveVote.answerId))) {
			const nextSelected = String(myActiveVote.answerId);
			if (selectedAnswerId !== nextSelected) {
				selectedAnswerId = nextSelected;
			}
			return;
		}

		if (!selectedAnswerId || !answerIds.has(selectedAnswerId)) {
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
				if (!isUniqueConstraintErrorFor(error, 'participant_sessions', 'pollUserKey')) {
					errorMessage =
						error instanceof Error
							? error.message
							: 'Unable to initialize your participant session.';
				}
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

	async function castVote(answerId: string) {
		if (!auth.user || !poll || !activeQuestion || !answerId || isCastingVote || !canVote) return;
		if (myActiveVote?.answerId === answerId) return;

		const activeAnswerIds = new Set(
			(activeQuestion.answers ?? []).map((answer: Record<string, any>) => String(answer.id))
		);
		if (!activeAnswerIds.has(answerId)) return;

		selectedAnswerId = answerId;
		isCastingVote = true;
		errorMessage = null;
		try {
			await db.transact(
				buildCastOrRevoteTx({
					pollId: poll.id,
					questionId: activeQuestion.id,
					pollOwnerId: poll.ownerId,
					answerId,
					voterId: auth.user.id,
					existingVoteId: myActiveVote?.id,
					participantSessionId: participantSession?.id
				})
			);
		} catch (error) {
			if (!isUniqueConstraintErrorFor(error, 'votes', 'voterQuestionKey')) {
				errorMessage = error instanceof Error ? error.message : 'Unable to submit vote.';
			} else {
				try {
					await db.transact(
						buildRevoteByVoteKeyTx({
							questionId: activeQuestion.id,
							answerId,
							voterId: auth.user.id,
							participantSessionId: participantSession?.id
						})
					);
				} catch (fallbackError) {
					errorMessage =
						fallbackError instanceof Error ? fallbackError.message : 'Unable to submit vote.';
				}
			}
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
	<header class="stack">
		<h1 class="no-margin">{poll.title}</h1>
	</header>

	{#if isPreStart}
		<section class="box gradient-surface">
			<div class="stack text-center">
				<span class="chip">Poll lobby</span>
				<h2 class="h3 no-margin">{poll.title}</h2>
				<p class="no-margin"><strong>Starting soon.</strong></p>
			</div>
		</section>
	{:else if activeQuestion}
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
							disabled={!canVote || isCastingVote}
							onclick={() => {
								void castVote(answer.id);
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

				{#if !canVote && voteLockLabel}
					<span class="tag muted">{voteLockLabel}</span>
				{/if}
			</div>
		</section>
	{:else}
		<div class="callout info">
			<p><strong>Waiting for the host</strong></p>
			<p>The next question will appear here automatically.</p>
		</div>
	{/if}
{/if}

{#if errorMessage}
	<div class="callout error">
		<p>{errorMessage}</p>
	</div>
{/if}
