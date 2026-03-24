<script lang="ts">
	let { children } = $props();
</script>

<section class="app-shell gradient-slate">
	<main class="section">
		<div class="layout-readable center stack">
			{@render children()}
		</div>
	</main>
</section>
