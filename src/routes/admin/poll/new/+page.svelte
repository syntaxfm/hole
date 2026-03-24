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
	<p class="text-muted">Checking session…</p>
{:else if !auth.user}
	<div class="callout warning">
		<p>Sign in first to create a poll.</p>
	</div>
{:else}
	<form
		class="stack"
		style="--gap: var(--vs-l);"
		onsubmit={(event) => {
			event.preventDefault();
			void submitCreatePoll();
		}}
	>
		<section class="box">
			<div class="stack" style="--gap: var(--vs-m);">
				<div class="split">
					<h2 class="h3 no-margin">Create a new poll</h2>
					<span class="chip">{questions.length} questions · {totalAnswers} answers</span>
				</div>

				<label class="row" for="poll-title-input">
					<span>Poll title</span>
					<input id="poll-title-input" bind:value={title} placeholder="e.g. JS Nation Live Poll" />
				</label>
			</div>
		</section>

		<section class="box">
			<div class="stack" style="--gap: var(--vs-s);">
				<h3 class="h5 no-margin">Session settings</h3>

				<label class="form-option-row">
					<input type="checkbox" bind:checked={allowRevoteWhileCollecting} />
					<span>Allow revote while collecting</span>
				</label>

				<label class="form-option-row">
					<input type="checkbox" bind:checked={startLive} />
					<span>Start live immediately on first question</span>
				</label>

				<label class="form-option-row">
					<input type="checkbox" bind:checked={isEmbedPublic} />
					<span>Public embed enabled</span>
				</label>

				<fieldset class="stack" style="--gap: var(--vs-xs);">
					<legend class="text-muted">Participant results visibility</legend>
					<label class="form-option-row">
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
					<label class="form-option-row">
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
				</fieldset>
			</div>
		</section>

		<section class="stack" style="--gap: var(--vs-s);">
			<div class="split">
				<h3 class="h5 no-margin">Questions</h3>
				<button class="button" type="button" onclick={addQuestion}>+ Add question</button>
			</div>

			{#each questions as question, questionIndex (question.localId)}
				<article class="box">
					<div class="stack" style="--gap: var(--vs-s);">
						<div class="split">
							<h4 class="h5 no-margin">Question {questionIndex + 1}</h4>
							<button
								class="button mini ghost"
								type="button"
								disabled={questions.length <= 1}
								onclick={() => removeQuestion(question.localId)}
							>
								Remove
							</button>
						</div>

						<label class="row" for={`question-${question.localId}`}>
							<span>Prompt</span>
							<textarea
								id={`question-${question.localId}`}
								bind:value={question.text}
								placeholder="Ask your multiple-choice question"
							></textarea>
						</label>

						<div class="stack" style="--gap: var(--vs-xs);">
							<div class="split">
								<h5 class="no-margin fs-s">Answers</h5>
								<button
									class="button mini"
									type="button"
									onclick={() => addAnswer(question.localId)}
								>
									+ Add answer
								</button>
							</div>

							{#each question.answers as answer, answerIndex (answer.localId)}
								<div class="cluster" style="--gap: var(--vs-xs); align-items: end;">
									<label class="stack full" style="--gap: var(--vs-xs);">
										<span class="visually-hidden">Answer {answerIndex + 1} text</span>
										<input bind:value={answer.text} placeholder={`Answer ${answerIndex + 1}`} />
									</label>

									<label class="stack" style="--gap: var(--vs-xs);">
										<span class="visually-hidden">Answer {answerIndex + 1} color</span>
										<input type="color" bind:value={answer.color} />
									</label>

									<button
										class="button mini ghost"
										type="button"
										disabled={question.answers.length <= 2}
										onclick={() => removeAnswer(question.localId, answer.localId)}
									>
										Remove
									</button>
								</div>
							{/each}
						</div>
					</div>
				</article>
			{/each}
		</section>

		<div class="form-actions">
			<button class="button primary" type="submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating poll…' : 'Create poll and open drive'}
			</button>
		</div>
	</form>
{/if}

{#if errorMessage}
	<div class="callout error">
		<p>{errorMessage}</p>
	</div>
{/if}
