<script lang="ts">
	let pollId = $state('');

	const hasPollId = $derived(Boolean(pollId.trim()));
	const participantHref = $derived(hasPollId ? `/poll/${pollId.trim()}` : '#');
	const adminDriveHref = $derived(hasPollId ? `/admin/poll/${pollId.trim()}/drive` : '#');
	const embedHref = $derived(hasPollId ? `/embed/poll/${pollId.trim()}` : '#');
</script>

<main class="section">
	<div class="layout-readable center stack">
		<section class="stack text-center">
			<h1>Hole — realtime polling</h1>
			<p class="text-muted narrow center">
				Use your poll id to jump into participant, admin drive, or embed views.
			</p>
		</section>

		<section class="box">
			<div class="stack">
				<label class="row" for="poll-id-input">
					<span>Poll ID</span>
					<input id="poll-id-input" bind:value={pollId} placeholder="Paste poll id" />
				</label>

				<div class="cluster">
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
