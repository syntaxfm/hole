<script lang="ts">
	let pollId = $state('');

	const hasPollId = $derived(Boolean(pollId.trim()));
	const participantHref = $derived(hasPollId ? `/poll/${pollId.trim()}` : '#');
	const adminDriveHref = $derived(hasPollId ? `/admin/poll/${pollId.trim()}/drive` : '#');
	const embedHref = $derived(hasPollId ? `/embed/poll/${pollId.trim()}` : '#');
</script>

<main class="section">
	<div class="layout-readable center stack" style="--gap: var(--vs-l);">
		<section class="stack text-center" style="--gap: var(--vs-s);">
			<h1>Hole — realtime polling</h1>
			<p class="text-muted narrow" style="--narrow-width: 60ch; margin-inline: auto;">
				Use your poll id to jump into participant, admin drive, or embed views.
			</p>
		</section>

		<section class="card">
			<div class="card-body stack" style="--gap: var(--vs-m);">
				<label class="row" for="poll-id-input">
					<span>Poll ID</span>
					<input id="poll-id-input" bind:value={pollId} placeholder="Paste poll id" />
				</label>

				<div class="cluster" style="--gap: var(--vs-s);">
					<a class="button" href="/admin">Admin dashboard</a>
					<a class="button primary" href="/admin/poll/new">+ New poll</a>
					<a class="button" aria-disabled={!hasPollId} href={adminDriveHref}>Open drive</a>
					<a class="button" aria-disabled={!hasPollId} href={participantHref}>Participant view</a>
					<a class="button" aria-disabled={!hasPollId} href={embedHref}>Embed view</a>
				</div>
			</div>
		</section>
	</div>
</main>
