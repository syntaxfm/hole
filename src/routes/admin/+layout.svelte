<script lang="ts">
	import { db } from '$lib/instant/client';

	let { children } = $props();

	const auth = db.useAuth();
	let authError = $state<string | null>(null);
	let pending = $state<'signin' | 'signout' | null>(null);

	async function signInAsGuest() {
		authError = null;
		pending = 'signin';
		try {
			await db.auth.signInAsGuest();
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Unable to sign in.';
		} finally {
			pending = null;
		}
	}

	async function signOut() {
		authError = null;
		pending = 'signout';
		try {
			await db.auth.signOut({});
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Unable to sign out.';
		} finally {
			pending = null;
		}
	}
</script>

<section class="section">
	<div class="layout-readable center stack" style="--gap: var(--vs-l);">
		<header class="header border">
			<div class="stack" style="--gap: var(--vs-xs);">
				<h1 class="h3 no-margin">Admin drive</h1>
				<p class="text-muted no-margin">Host controls and realtime moderation tools.</p>
			</div>

			{#if auth.user}
				<div class="cluster" style="--gap: var(--vs-xs);">
					<span class="chip">
						{auth.user.isGuest ? 'Guest session' : (auth.user.email ?? auth.user.id)}
					</span>
					<a class="button" href="/admin">Dashboard</a>
					<a class="button primary" href="/admin/poll/new">+ New poll</a>
					<button class="button ghost" disabled={pending !== null} onclick={signOut}>
						{pending === 'signout' ? 'Signing out…' : 'Sign out'}
					</button>
				</div>
			{/if}
		</header>

		{#if auth.isLoading}
			<p class="text-muted">Checking auth…</p>
		{:else if !auth.user}
			<div class="callout warning">
				<p><strong>Sign in required</strong></p>
				<p>Use an Instant guest account to access admin controls.</p>
				<div class="cluster" style="--gap: var(--vs-s); margin-top: var(--vs-s);">
					<button class="button primary" disabled={pending !== null} onclick={signInAsGuest}>
						{pending === 'signin' ? 'Signing in…' : 'Sign in as guest'}
					</button>
				</div>
			</div>
		{:else}
			{@render children()}
		{/if}

		{#if authError}
			<div class="callout error">
				<p>{authError}</p>
			</div>
		{/if}
	</div>
</section>
