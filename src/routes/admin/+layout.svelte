<script lang="ts">
	import { db } from '$lib/instant/client';

	type UserRecord = Record<string, any>;

	let { children } = $props();

	const auth = db.useAuth();
	const currentUserQuery = db.useQuery(() =>
		auth.user
			? {
					$users: {
						$: {
							where: { id: auth.user.id },
							limit: 1
						}
					}
				}
			: null
	);

	const currentUser = $derived((currentUserQuery.data?.$users?.[0] ?? null) as UserRecord | null);
	const currentUserRole = $derived(
		String(currentUser?.role ?? '')
			.trim()
			.toLowerCase()
	);
	const isGuestSession = $derived(Boolean(auth.user?.isGuest));
	const isAdmin = $derived(Boolean(auth.user && !isGuestSession && currentUserRole === 'admin'));

	let authError = $state<string | null>(null);
	let pending = $state<'send-code' | 'verify-code' | 'signout' | null>(null);
	let adminEmail = $state('');
	let magicCode = $state('');
	let pendingEmail = $state<string | null>(null);

	const canSendCode = $derived(
		pending === null && adminEmail.trim().length > 3 && adminEmail.includes('@')
	);
	const canVerifyCode = $derived(
		pending === null && pendingEmail !== null && magicCode.trim().length > 0
	);

	async function sendMagicCode() {
		const email = adminEmail.trim().toLowerCase();
		if (!email) {
			authError = 'Email is required.';
			return;
		}

		authError = null;
		pending = 'send-code';
		try {
			await db.auth.sendMagicCode({ email });
			pendingEmail = email;
			adminEmail = email;
			magicCode = '';
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Unable to send sign-in code.';
		} finally {
			pending = null;
		}
	}

	async function verifyMagicCode() {
		const email = pendingEmail ?? adminEmail.trim().toLowerCase();
		const code = magicCode.trim();

		if (!email || !code) {
			authError = 'Email and code are required.';
			return;
		}

		authError = null;
		pending = 'verify-code';
		try {
			await db.auth.signInWithMagicCode({
				email,
				code
			});
			pendingEmail = null;
			magicCode = '';
		} catch (error) {
			authError = error instanceof Error ? error.message : 'Unable to complete sign in.';
		} finally {
			pending = null;
		}
	}

	async function signOut() {
		authError = null;
		pending = 'signout';
		try {
			await db.auth.signOut({});
			pendingEmail = null;
			magicCode = '';
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
						{isGuestSession ? 'Guest session (blocked)' : (auth.user.email ?? auth.user.id)}
					</span>
					{#if isAdmin}
						<a class="button" href="/admin">Dashboard</a>
						<a class="button primary" href="/admin/poll/new">+ New poll</a>
					{/if}
					<button class="button ghost" disabled={pending !== null} onclick={signOut}>
						{pending === 'signout' ? 'Signing out…' : 'Sign out'}
					</button>
				</div>
			{/if}
		</header>

		{#if auth.isLoading}
			<p class="text-muted">Checking auth…</p>
		{:else if !auth.user}
			<div class="callout warning stack" style="--gap: var(--vs-s);">
				<p><strong>Admin sign in required</strong></p>
				<p>Use email sign-in for admin access. Guest sessions are not allowed in admin.</p>

				<form
					class="stack"
					style="--gap: var(--vs-xs);"
					onsubmit={(event) => {
						event.preventDefault();
						void sendMagicCode();
					}}
				>
					<label class="row" for="admin-email-input">
						<span>Admin email</span>
						<input
							id="admin-email-input"
							type="email"
							autocomplete="email"
							bind:value={adminEmail}
							placeholder="you@example.com"
						/>
					</label>
					<div class="cluster" style="--gap: var(--vs-xs);">
						<button class="button primary" type="submit" disabled={!canSendCode}>
							{#if pending === 'send-code'}
								Sending code…
							{:else if pendingEmail}
								Resend code
							{:else}
								Send sign-in code
							{/if}
						</button>
					</div>
				</form>

				{#if pendingEmail}
					<form
						class="stack"
						style="--gap: var(--vs-xs);"
						onsubmit={(event) => {
							event.preventDefault();
							void verifyMagicCode();
						}}
					>
						<label class="row" for="admin-code-input">
							<span>One-time code</span>
							<input
								id="admin-code-input"
								inputmode="numeric"
								autocomplete="one-time-code"
								bind:value={magicCode}
								placeholder="123456"
							/>
						</label>
						<div class="cluster" style="--gap: var(--vs-xs); align-items: center;">
							<button class="button" type="submit" disabled={!canVerifyCode}>
								{pending === 'verify-code' ? 'Verifying…' : 'Verify and sign in'}
							</button>
							<small class="text-muted">Code sent to {pendingEmail}</small>
						</div>
					</form>
				{/if}
			</div>
		{:else if isGuestSession}
			<div class="callout warning">
				<p><strong>Guest accounts are blocked for admin.</strong></p>
				<p>Sign out and use email sign-in with an admin account.</p>
			</div>
		{:else if currentUserQuery.isLoading}
			<p class="text-muted">Checking admin permissions…</p>
		{:else if currentUserQuery.error}
			<div class="callout error">
				<p>{currentUserQuery.error.message}</p>
			</div>
		{:else if !isAdmin}
			<div class="callout warning">
				<p><strong>Access denied.</strong></p>
				<p>
					This account is signed in, but it is not an admin. Promote this user in
					<code>$users.role</code> to <code>admin</code>.
				</p>
				<p class="text-muted no-margin">Detected role: {currentUser?.role ?? '(none)'}</p>
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
