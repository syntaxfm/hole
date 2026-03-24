<script lang="ts">
	import { goto } from '$app/navigation';
	import { id } from '@instantdb/svelte';

	import { db } from '$lib/instant/client';
	import {
		createPoll,
		type NewQuestionInput,
		type ParticipantResultsMode
	} from '$lib/instant/transactions';

	type AnswerDraft = {
		localId: string;
		text: string;
		color: string;
	};

	type QuestionDraft = {
		localId: string;
		text: string;
		answers: AnswerDraft[];
	};

	const answerPalette = ['#5A67FF', '#00A96E', '#FF8A3D', '#D946EF', '#00B8D9', '#E11D48'];

	const auth = db.useAuth();

	let title = $state('');
	let allowRevoteWhileCollecting = $state(true);
	let participantResultsMode = $state<ParticipantResultsMode>('count_only');
	let isEmbedPublic = $state(true);
	let startLive = $state(false);
	let questions = $state<QuestionDraft[]>([createQuestionDraft()]);

	let isSubmitting = $state(false);
	let errorMessage = $state<string | null>(null);

	const totalAnswers = $derived(
		questions.reduce((count, question) => count + question.answers.length, 0)
	);

	function createAnswerDraft(index: number): AnswerDraft {
		return {
			localId: id(),
			text: '',
			color: answerPalette[index % answerPalette.length]
		};
	}

	function createQuestionDraft(): QuestionDraft {
		return {
			localId: id(),
			text: '',
			answers: [createAnswerDraft(0), createAnswerDraft(1)]
		};
	}

	function addQuestion() {
		questions.push(createQuestionDraft());
	}

	function removeQuestion(questionLocalId: string) {
		if (questions.length <= 1) return;

		const index = questions.findIndex((question) => question.localId === questionLocalId);
		if (index >= 0) questions.splice(index, 1);
	}

	function addAnswer(questionLocalId: string) {
		const question = questions.find((entry) => entry.localId === questionLocalId);
		if (!question) return;

		question.answers.push(createAnswerDraft(question.answers.length));
	}

	function removeAnswer(questionLocalId: string, answerLocalId: string) {
		const question = questions.find((entry) => entry.localId === questionLocalId);
		if (!question || question.answers.length <= 2) return;

		const index = question.answers.findIndex((answer) => answer.localId === answerLocalId);
		if (index >= 0) question.answers.splice(index, 1);
	}

	function toCreateQuestionPayload(): NewQuestionInput[] {
		return questions.map((question) => ({
			text: question.text,
			answers: question.answers.map((answer) => ({
				text: answer.text,
				color: answer.color || undefined
			}))
		}));
	}

	async function submitCreatePoll() {
		const user = auth.user;
		if (!user) {
			errorMessage = 'You must be signed in to create a poll.';
			return;
		}

		errorMessage = null;
		isSubmitting = true;
		try {
			const created = await createPoll({
				title,
				ownerId: user.id,
				questions: toCreateQuestionPayload(),
				allowRevoteWhileCollecting,
				participantResultsMode,
				isEmbedPublic,
				startLive
			});

			await goto(`/admin/poll/${created.pollId}/drive`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to create poll right now.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

{#if auth.isLoading}
	<p>Checking session…</p>
{:else if !auth.user}
	<p>Sign in first to create a poll.</p>
{:else}
	<form
		class="create-poll"
		onsubmit={(event) => {
			event.preventDefault();
			void submitCreatePoll();
		}}
	>
		<section class="panel">
			<h2>Create a new poll</h2>
			<p class="meta">{questions.length} questions · {totalAnswers} answers</p>

			<label class="field">
				<span>Poll title</span>
				<input bind:value={title} placeholder="e.g. JS Nation Live Poll" />
			</label>
		</section>

		<section class="panel settings">
			<h3>Session settings</h3>

			<label>
				<input type="checkbox" bind:checked={allowRevoteWhileCollecting} />
				<span>Allow revote while collecting</span>
			</label>

			<label>
				<input type="checkbox" bind:checked={startLive} />
				<span>Start live immediately on first question</span>
			</label>

			<label>
				<input type="checkbox" bind:checked={isEmbedPublic} />
				<span>Public embed enabled</span>
			</label>

			<div class="field">
				<span>Participant results visibility</span>
				<div class="segmented">
					<label>
						<input
							type="radio"
							name="participant-results-mode"
							value="count_only"
							checked={participantResultsMode === 'count_only'}
							onchange={() => {
								participantResultsMode = 'count_only';
							}}
						/>
						<span>Count only (default)</span>
					</label>
					<label>
						<input
							type="radio"
							name="participant-results-mode"
							value="full"
							checked={participantResultsMode === 'full'}
							onchange={() => {
								participantResultsMode = 'full';
							}}
						/>
						<span>Show full breakdown after reveal</span>
					</label>
				</div>
			</div>
		</section>

		<section class="panel question-list">
			<div class="question-list-header">
				<h3>Questions</h3>
				<button type="button" onclick={addQuestion}>+ Add question</button>
			</div>

			{#each questions as question, questionIndex (question.localId)}
				<article class="question-card">
					<div class="question-card-header">
						<h4>Question {questionIndex + 1}</h4>
						<button
							type="button"
							disabled={questions.length <= 1}
							onclick={() => removeQuestion(question.localId)}
						>
							Remove
						</button>
					</div>

					<label class="field">
						<span>Prompt</span>
						<textarea bind:value={question.text} placeholder="Ask your multiple-choice question"
						></textarea>
					</label>

					<div class="answers">
						<div class="answers-header">
							<h5>Answers</h5>
							<button type="button" onclick={() => addAnswer(question.localId)}>
								+ Add answer
							</button>
						</div>

						{#each question.answers as answer, answerIndex (answer.localId)}
							<div class="answer-row">
								<label>
									<span class="visually-hidden">Answer {answerIndex + 1} text</span>
									<input bind:value={answer.text} placeholder={`Answer ${answerIndex + 1}`} />
								</label>

								<label>
									<span class="visually-hidden">Answer {answerIndex + 1} color</span>
									<input type="color" bind:value={answer.color} />
								</label>

								<button
									type="button"
									disabled={question.answers.length <= 2}
									onclick={() => removeAnswer(question.localId, answer.localId)}
								>
									Remove
								</button>
							</div>
						{/each}
					</div>
				</article>
			{/each}
		</section>

		<footer class="panel footer-actions">
			<button type="submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating poll…' : 'Create poll and open drive'}
			</button>
		</footer>
	</form>
{/if}

{#if errorMessage}
	<p class="error">{errorMessage}</p>
{/if}

<style>
	.create-poll {
		display: grid;
		gap: 1rem;
	}

	.panel {
		border: 1px solid color-mix(in srgb, canvastext 14%, transparent);
		border-radius: 0.9rem;
		padding: 1rem;
		display: grid;
		gap: 0.8rem;
		background: color-mix(in srgb, canvas 95%, canvastext 5%);
	}

	h2,
	h3,
	h4,
	h5,
	p {
		margin: 0;
	}

	.meta {
		opacity: 0.76;
		font-size: 0.92rem;
	}

	.field {
		display: grid;
		gap: 0.4rem;
	}

	input,
	textarea,
	button {
		font: inherit;
	}

	input,
	textarea {
		padding: 0.65rem 0.75rem;
		border-radius: 0.65rem;
		border: 1px solid color-mix(in srgb, canvastext 20%, transparent);
		background: canvas;
	}

	textarea {
		min-height: 4.5rem;
		resize: vertical;
	}

	button {
		padding: 0.55rem 0.85rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, canvastext 20%, transparent);
		background: canvas;
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.48;
		cursor: not-allowed;
	}

	.settings {
		gap: 0.65rem;
	}

	.settings label {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.segmented {
		display: grid;
		gap: 0.5rem;
	}

	.segmented label {
		padding: 0.45rem 0.55rem;
		border: 1px solid color-mix(in srgb, canvastext 12%, transparent);
		border-radius: 0.65rem;
	}

	.question-list {
		gap: 0.9rem;
	}

	.question-list-header,
	.question-card-header,
	.answers-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
	}

	.question-card {
		display: grid;
		gap: 0.7rem;
		padding: 0.85rem;
		border-radius: 0.8rem;
		border: 1px solid color-mix(in srgb, canvastext 10%, transparent);
		background: color-mix(in srgb, #5a67ff 5%, canvas 95%);
	}

	.answers {
		display: grid;
		gap: 0.5rem;
	}

	.answer-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto auto;
		gap: 0.5rem;
		align-items: center;
	}

	.answer-row input[type='color'] {
		padding: 0.2rem;
		width: 2.6rem;
		height: 2.2rem;
	}

	.footer-actions {
		display: flex;
		justify-content: flex-end;
	}

	.footer-actions button {
		background: #5a67ff;
		color: #fff;
		border-color: transparent;
	}

	.error {
		color: #d11f4f;
		font-weight: 600;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 700px) {
		.answer-row {
			grid-template-columns: 1fr;
		}

		.footer-actions {
			justify-content: stretch;
		}

		.footer-actions button {
			width: 100%;
		}
	}
</style>
