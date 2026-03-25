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
			poll && displayQuestion && (poll.status === 'closed' || poll.activePhase === 'revealed')
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
	<p class="text-muted">Loading embed…</p>
{:else if query.error}
	<div class="callout error">
		<p>{query.error.message}</p>
	</div>
{:else if !poll}
	<div class="callout warning">
		<p><strong>Poll unavailable</strong></p>
		<p>Embed is only visible when a poll is live or closed.</p>
	</div>
{:else if !displayQuestion}
	<section class="box">
		<div class="stack">
			<h2 class="h3 no-margin">{poll.title}</h2>
			<p class="text-muted no-margin">Waiting for a question…</p>
		</div>
	</section>
{:else}
	<section class="box gradient-surface">
		<div class="stack">
			<span class="chip">{poll.title}</span>
			<h2 class="h3 no-margin">{displayQuestion.text}</h2>
			<p class="text-muted no-margin">Responses: {stats?.totalVotes ?? 0}</p>
		</div>
	</section>

	{#if canShowBreakdown}
		<section class="box">
			<div class="stack">
				<h3 class="h5 no-margin">Answer breakdown</h3>
				<div class="table">
					<table>
						<thead>
							<tr>
								<th>Answer</th>
								<th class="text-end">Votes</th>
								<th class="text-end">Share</th>
							</tr>
						</thead>
						<tbody>
							{#each displayQuestion.answers ?? [] as answer (answer.id)}
								<tr>
									<td>{answer.text}</td>
									<td class="text-end">{answerCount(answer.id)}</td>
									<td class="text-end">{answerPercentage(answer.id)}%</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</section>
	{:else}
		<div class="callout info">
			<p>Answer breakdown hidden until reveal.</p>
		</div>
	{/if}
{/if}
