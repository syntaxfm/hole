<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { Tween, prefersReducedMotion } from 'svelte/motion';
	import { fade } from 'svelte/transition';

	let {
		label,
		value,
		total,
		color = '#5A67FF'
	}: {
		label: string;
		value: number;
		total: number;
		color?: string;
	} = $props();

	const targetPercent = $derived(total > 0 ? (value / total) * 100 : 0);
	const barPercent = Tween.of(() => targetPercent, {
		duration: prefersReducedMotion.current ? 0 : 420,
		easing: cubicOut
	});
	const clampedPercent = $derived(Math.max(0, Math.min(100, barPercent.current)));
	const roundedPercent = $derived(Math.round(targetPercent));
</script>

<div class="result-row stack" transition:fade={{ duration: 140 }}>
	<div class="split">
		<span>{label}</span>
		<small class="text-muted">{value} · {roundedPercent}%</small>
	</div>

	<div class="result-track" aria-hidden="true">
		<div
			class="result-fill"
			style:width={`${clampedPercent}%`}
			style:background={color || '#5A67FF'}
		></div>
	</div>
</div>

<style>
	.result-row {
		gap: var(--vs-2xs, 0.35rem);
	}

	.result-track {
		height: 0.8rem;
		border-radius: 999px;
		overflow: hidden;
		background: rgba(127, 127, 127, 0.25);
	}

	.result-fill {
		height: 100%;
		border-radius: inherit;
	}
</style>
