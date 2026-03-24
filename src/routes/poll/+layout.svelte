<script lang="ts">
	let { children } = $props();
</script>

<section class="section">
	<div class="layout-readable center stack">
		<header class="stack">
			<h1 class="no-margin">Live poll</h1>
			<p class="text-muted no-margin">Vote from your device and watch updates in realtime.</p>
		</header>

		{@render children()}
	</div>
</section>
