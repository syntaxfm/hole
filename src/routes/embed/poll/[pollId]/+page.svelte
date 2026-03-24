<script lang="ts">
	import { db } from '$lib/instant/client';
	import { embedLivePollQuery } from '$lib/instant/queries';

	let { params } = $props();

	const pollId = $derived(params.pollId);
	const query = db.useQuery(() => embedLivePollQuery(pollId));

	const poll = $derived((query.data?.polls?.[0] ?? null) as Record<string, any> | null);
	const questions = $derived(
		((poll?.questions ?? []) as Array<Record<string, any>>).sort(sortByOrder)
	);
	const activeQuestion = $derived(
		questions.find((question) => question.id === poll?.activeQuestionId) ?? null
	);
	const displayQuestion = $derived(activeQuestion ?? questions[questions.length - 1] ?? null);
	const stats = $derived(getQuestionStats(displayQuestion));

	const canShowBreakdown = $derived(
		Boolean(
			poll &&
			displayQuestion &&
			(poll.status === 'closed' || poll.activePhase === 'revealed') &&
			poll.participantResultsMode === 'full'
		)
	);

	function sortByOrder(a: Record<string, any>, b: Record<string, any>) {
		return Number(a.order) - Number(b.order);
	}

	function getQuestionStats(question: Record<string, any> | null) {
		if (!question?.stats) return null;
		return Array.isArray(question.stats) ? question.stats[0] : question.stats;
	}

	function answerCount(answerId: string): number {
		const counts = (stats?.countsByAnswer ?? {}) as Record<string, number>;
		return Number(counts[answerId] ?? 0);
	}

	function answerPercentage(answerId: string): number {
		const total = Number(stats?.totalVotes ?? 0);
		if (total <= 0) return 0;
		return Math.round((answerCount(answerId) / total) * 100);
	}
</script>

{#if query.isLoading}
	<p>Loading embed…</p>
{:else if query.error}
	<p class="error">{query.error.message}</p>
{:else if !poll}
	<div class="card">
		<h2>Poll unavailable</h2>
		<p>Embed is only visible when a poll is live or closed.</p>
	</div>
{:else if !displayQuestion}
	<div class="card">
		<h2>{poll.title}</h2>
		<p>Waiting for a question…</p>
	</div>
{:else}
	<div class="card">
		<p class="pill">{poll.title}</p>
		<h2>{displayQuestion.text}</h2>
		<p class="meta">Responses: {stats?.totalVotes ?? 0}</p>
	</div>

	{#if canShowBreakdown}
		<section class="card answers">
			{#each displayQuestion.answers ?? [] as answer (answer.id)}
				<div class="answer-row">
					<div class="label-row">
						<span>{answer.text}</span>
						<strong>{answerPercentage(answer.id)}%</strong>
					</div>
					<div class="meter" role="presentation">
						<div style:width={`${answerPercentage(answer.id)}%`}></div>
					</div>
					<small>{answerCount(answer.id)} votes</small>
				</div>
			{/each}
		</section>
	{:else}
		<div class="card">
			<p>Answer breakdown hidden until reveal.</p>
		</div>
	{/if}
{/if}

<style>
	.card {
		max-width: 72rem;
		margin: 0 auto 1rem;
		padding: 1rem;
		border-radius: 0.9rem;
		background: color-mix(in srgb, #11162a 88%, white 12%);
		border: 1px solid color-mix(in srgb, white 14%, transparent);
		display: grid;
		gap: 0.75rem;
	}

	h2,
	p {
		margin: 0;
	}

	.pill {
		display: inline-flex;
		width: fit-content;
		padding: 0.3rem 0.65rem;
		border-radius: 999px;
		background: color-mix(in srgb, #5a67ff 24%, transparent);
		font-size: 0.82rem;
		letter-spacing: 0.01em;
	}

	.meta {
		opacity: 0.82;
	}

	.answers {
		gap: 0.85rem;
	}

	.answer-row {
		display: grid;
		gap: 0.36rem;
	}

	.label-row {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}

	.meter {
		height: 0.65rem;
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in srgb, white 18%, transparent);
	}

	.meter > div {
		height: 100%;
		background: linear-gradient(90deg, #5a67ff, #7f8bff);
	}

	small {
		opacity: 0.74;
	}

	.error {
		color: #ff7e9f;
		font-weight: 600;
	}
</style>
