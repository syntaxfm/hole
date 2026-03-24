<script lang="ts">
	import { db } from '$lib/instant/client';
	import { adminPollsQuery } from '$lib/instant/queries';

	type PollRecord = Record<string, any>;

	const auth = db.useAuth();
	const query = db.useQuery(() => (auth.user ? adminPollsQuery(auth.user.id) : null));

	const polls = $derived((query.data?.polls ?? []) as PollRecord[]);
	const livePolls = $derived(polls.filter((poll) => poll.status === 'live').length);
	const draftPolls = $derived(polls.filter((poll) => poll.status === 'draft').length);
	const closedPolls = $derived(polls.filter((poll) => poll.status === 'closed').length);

	const totalResponses = $derived(
		polls.reduce((total, poll) => total + pollResponseCount(poll), 0)
	);

	function pollResponseCount(poll: PollRecord): number {
		const stats = (poll.questionStats ?? []) as PollRecord[];
		return stats.reduce((sum, item) => sum + Number(item.totalVotes ?? 0), 0);
	}

	function statusTagClass(status: string): 'info' | 'warning' | 'success' {
		if (status === 'live') return 'info';
		if (status === 'closed') return 'success';
		return 'warning';
	}
</script>

<section class="stack" style="--gap: var(--vs-l);">
	<div class="split">
		<div class="stack" style="--gap: var(--vs-xs);">
			<h2 class="h3 no-margin">Poll dashboard</h2>
			<p class="text-muted no-margin">Create and manage all polls for this account.</p>
		</div>
		<div class="cluster" style="--gap: var(--vs-xs);">
			<a class="button primary" href="/admin/poll/new">+ New poll</a>
		</div>
	</div>

	<div class="layout-card" style="--min-card-width: 180px; --gap: var(--vs-s);">
		<article class="stat-card">
			<small>Total polls</small>
			<strong>{polls.length}</strong>
		</article>
		<article class="stat-card">
			<small>Live polls</small>
			<strong>{livePolls}</strong>
		</article>
		<article class="stat-card">
			<small>Draft polls</small>
			<strong>{draftPolls}</strong>
		</article>
		<article class="stat-card">
			<small>Closed polls</small>
			<strong>{closedPolls}</strong>
		</article>
		<article class="stat-card">
			<small>Total responses</small>
			<strong>{totalResponses}</strong>
		</article>
	</div>

	{#if query.isLoading}
		<p class="text-muted">Loading your polls…</p>
	{:else if query.error}
		<div class="callout error">
			<p>{query.error.message}</p>
		</div>
	{:else if !polls.length}
		<div class="callout">
			<p><strong>No polls yet.</strong></p>
			<p>Create your first poll to start collecting live responses.</p>
			<div class="cluster" style="--gap: var(--vs-xs); margin-top: var(--vs-s);">
				<a class="button primary" href="/admin/poll/new">Create first poll</a>
			</div>
		</div>
	{:else}
		<article class="box">
			<div class="stack" style="--gap: var(--vs-m);">
				<header class="split">
					<h3 class="h5 no-margin">Recent polls</h3>
					<span class="chip">{polls.length} total</span>
				</header>

				<div class="table">
					<table>
						<thead>
							<tr>
								<th>Poll</th>
								<th>Status</th>
								<th>Questions</th>
								<th>Responses</th>
								<th class="text-end">Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each polls as poll (poll.id)}
								<tr>
									<td>
										<div class="stack" style="--gap: var(--vs-xs);">
											<strong>{poll.title}</strong>
											<small class="text-muted">{poll.id}</small>
										</div>
									</td>
									<td>
										<span class={`tag ${statusTagClass(String(poll.status ?? 'draft'))}`}>
											{poll.status}
										</span>
									</td>
									<td>{(poll.questions ?? []).length}</td>
									<td>{pollResponseCount(poll)}</td>
									<td class="text-end">
										<div class="cluster" style="--gap: var(--vs-xs); justify-content: flex-end;">
											<a class="button mini" href={`/admin/poll/${poll.id}/drive`}>Drive</a>
											<a
												class="button mini"
												href={`/poll/${poll.id}`}
												target="_blank"
												rel="noreferrer">Participant</a
											>
											<a
												class="button mini"
												href={`/embed/poll/${poll.id}`}
												target="_blank"
												rel="noreferrer">Embed</a
											>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</article>
	{/if}
</section>
