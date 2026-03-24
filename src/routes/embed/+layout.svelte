<script lang="ts">
	let { children } = $props();
</script>

<section class="section gradient-slate" style="min-height: 100dvh;">
	<div class="layout-readable center stack" style="--gap: var(--vs-m);">
		{@render children()}
	</div>
</section>
