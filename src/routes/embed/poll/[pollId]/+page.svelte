<script lang="ts">
	import { browser } from '$app/environment';
	import { base } from '$app/paths';

	import HorizontalResultBar from '$lib/components/HorizontalResultBar.svelte';
	import { db } from '$lib/instant/client';
	import { embedLivePollQuery } from '$lib/instant/queries';

	let { params } = $props();

	const query = db.useQuery(() => embedLivePollQuery(params.pollId));

	function getJoinUrl(): string {
		const participantPath = `${base}/poll/${params.pollId}`;
		return new URL(participantPath, window.location.origin).toString();
	}

	function getJoinQrImageUrl(): string | null {
		return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=0&data=${encodeURIComponent(getJoinUrl())}`;
	}

	function getActiveQuestion(poll: Record<string, any>) {
		const questions = (poll.questions ?? []) as Array<Record<string, any>>;
		return questions.find((question) => question.id === poll.activeQuestionId) ?? null;
	}

	function getQuestionStasts(question: Record<string, any> | null) {
		if (!question?.stats) return null;
		return Array.isArray(question.stats) ? question.stats[0] : question.stats;
	}

	function answerCount(stats: Record<string, any> | null, answerId: string): number {
		const counts = (stats?.countsByAnswer ?? {}) as Record<string, number>;
		return Number(counts[answerId] ?? 0);
	}
	function getQuestionStats(question: Record<string, any> | null) {
		if (!question?.stats) return null;
		return Array.isArray(question.stats) ? question.stats[0] : question.stats;
	}
</script>

{#if query.isLoading}
	<p class="text-muted">Loading embed…</p>
{:else if query.error}
	<div class="callout error">
		<p>{query.error.message}</p>
	</div>
{:else if !query.data?.polls?.[0]}
	<div class="callout warning">
		<p><strong>Poll unavailable</strong></p>
		<p>Embed is not public or the poll id is invalid.</p>
	</div>
{:else}
	{@const activeQuestion = getActiveQuestion(query.data.polls[0])}
	{@const stats = getQuestionStats(activeQuestion)}
	{@const canShowBreakdown = Boolean(
		activeQuestion &&
		(query.data.polls[0].status === 'closed' || query.data.polls[0].activePhase === 'revealed')
	)}

	{#if !activeQuestion}
		{@const joinQrImageUrl = getJoinQrImageUrl()}
		<section class="box gradient-surface">
			<div class="stack text-center">
				<span class="chip">{query.data.polls[0].title}</span>
				<h2 class="h3 no-margin">Starting soon.</h2>
				{#if joinQrImageUrl}
					<img
						src={joinQrImageUrl}
						alt="QR code that opens the participant join link"
						width="220"
						height="220"
					/>
				{:else}
					<p class="text-muted no-margin">Loading QR code…</p>
				{/if}
			</div>
		</section>
	{:else}
		<section class="box gradient-surface">
			<div class="stack">
				<span class="chip">{query.data.polls[0].title}</span>
				<h2 class="h3 no-margin">{activeQuestion.text}</h2>
				<p class="text-muted no-margin">Responses: {stats?.totalVotes ?? 0}</p>
			</div>
		</section>

		{#if canShowBreakdown}
			<section class="box">
				<div class="stack" style="--gap: var(--vs-xs);">
					<h3 class="h5 no-margin">Answer breakdown</h3>
					{#each activeQuestion.answers ?? [] as answer (answer.id)}
						<HorizontalResultBar
							label={answer.text}
							value={answerCount(stats, answer.id)}
							total={Number(stats?.totalVotes ?? 0)}
							color={String(answer.color ?? '') || '#5A67FF'}
						/>
					{/each}
				</div>
			</section>
		{:else}
			<div class="callout info">
				<p>Answer breakdown hidden until reveal.</p>
			</div>
		{/if}
	{/if}
{/if}
