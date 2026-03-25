<script lang="ts">
	let { children, params } = $props();

	const pollId = $derived(params.pollId);
	const driveHref = $derived(`/admin/poll/${pollId}/drive`);
	const editHref = $derived(`/admin/poll/${pollId}/edit`);
	const participantHref = $derived(`/poll/${pollId}`);
	const embedHref = $derived(`/embed/poll/${pollId}`);
</script>

<section class="stack">
	<header class="header border">
		<h2 class="h3 no-margin">Poll {pollId}</h2>
		<nav class="cluster">
			<a class="button" href={driveHref}>Drive</a>
			<a class="button" href={editHref}>Edit</a>
			<a class="button" href={participantHref} target="_blank" rel="noreferrer">Participant</a>
			<a class="button" href={embedHref} target="_blank" rel="noreferrer">Embed</a>
		</nav>
	</header>

	{@render children()}
</section>
