<script lang="ts">
	let { children } = $props();
</script>

<section class="section">
	<div class="layout-readable center stack">
		{@render children()}
	</div>
</section>
