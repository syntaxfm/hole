<script lang="ts">
	import { id } from '@instantdb/svelte';

	import { db } from '$lib/instant/client';
	import { adminPollEditQuery } from '$lib/instant/queries';
	import {
		buildAddQuestionTx,
		buildCreateAnswerTx,
		buildDeleteAnswerTx,
		buildDeleteQuestionTx,
		buildUpdateAnswerTx,
		buildUpdatePollSettingsTx,
		buildUpdateQuestionTx,
		type ParticipantResultsMode,
		type QuestionStatus
	} from '$lib/instant/transactions';

	type PollRecord = Record<string, any>;

	type AnswerDraft = {
		id?: string;
		localId: string;
		text: string;
		color: string;
	};

	type QuestionDraft = {
		id?: string;
		localId: string;
		text: string;
		status: QuestionStatus;
		answers: AnswerDraft[];
	};

	const answerPalette = ['#5A67FF', '#00A96E', '#FF8A3D', '#D946EF', '#00B8D9', '#E11D48'];

	let { params } = $props();

	const pollId = $derived(params.pollId);
	const auth = db.useAuth();
	const query = db.useQuery(() => (auth.user ? adminPollEditQuery(pollId, auth.user.id) : null));
	const poll = $derived((query.data?.polls?.[0] ?? null) as PollRecord | null);

	let title = $state('');
	let allowRevoteWhileCollecting = $state(true);
	let participantResultsMode = $state<ParticipantResultsMode>('count_only');
	let isEmbedPublic = $state(true);
	let questionDrafts = $state<QuestionDraft[]>([]);

	const canEditStructure = $derived(Boolean(poll && poll.status === 'draft'));
	const totalAnswers = $derived(
		questionDrafts.reduce((count, question) => count + question.answers.length, 0)
	);

	let isSaving = $state(false);
	let saveError = $state<string | null>(null);
	let saveNotice = $state<string | null>(null);
	let loadedPollVersion = $state<string | null>(null);

	$effect(() => {
		if (!poll) return;

		const nextVersion = `${poll.id}:${poll.updatedAt ?? ''}`;
		if (loadedPollVersion === nextVersion) return;

		loadedPollVersion = nextVersion;
		loadDraftFromPoll(poll);
	});

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
			status: 'queued',
			answers: [createAnswerDraft(0), createAnswerDraft(1)]
		};
	}

	function normalizeQuestionStatus(value: unknown): QuestionStatus {
		if (value === 'active') return 'active';
		if (value === 'done') return 'done';
		return 'queued';
	}

	function sortByOrder(a: PollRecord, b: PollRecord) {
		return Number(a.order) - Number(b.order);
	}

	function getAnswerColor(answer: PollRecord, index: number): string {
		const color = String(answer.color ?? '').trim();
		return color || answerPalette[index % answerPalette.length];
	}

	function loadDraftFromPoll(sourcePoll: PollRecord) {
		title = String(sourcePoll.title ?? '');
		allowRevoteWhileCollecting = Boolean(sourcePoll.allowRevoteWhileCollecting ?? true);
		participantResultsMode = sourcePoll.participantResultsMode === 'full' ? 'full' : 'count_only';
		isEmbedPublic = Boolean(sourcePoll.isEmbedPublic ?? true);

		const sourceQuestions = [...((sourcePoll.questions ?? []) as PollRecord[])].sort(sortByOrder);
		questionDrafts = sourceQuestions.map((question) => {
			const answers = [...((question.answers ?? []) as PollRecord[])].sort(sortByOrder);
			const mappedAnswers = answers.map((answer, answerIndex) => ({
				id: String(answer.id),
				localId: id(),
				text: String(answer.text ?? ''),
				color: getAnswerColor(answer, answerIndex)
			}));

			while (mappedAnswers.length < 2) {
				mappedAnswers.push(createAnswerDraft(mappedAnswers.length));
			}

			return {
				id: String(question.id),
				localId: id(),
				text: String(question.text ?? ''),
				status: normalizeQuestionStatus(question.status),
				answers: mappedAnswers
			} satisfies QuestionDraft;
		});

		if (!questionDrafts.length) {
			questionDrafts = [createQuestionDraft()];
		}

		saveError = null;
		saveNotice = null;
	}

	function resetChanges() {
		if (!poll) return;
		loadDraftFromPoll(poll);
	}

	function addQuestion() {
		if (!canEditStructure) return;
		questionDrafts.push(createQuestionDraft());
	}

	function removeQuestion(questionLocalId: string) {
		if (!canEditStructure || questionDrafts.length <= 1) return;

		const index = questionDrafts.findIndex((question) => question.localId === questionLocalId);
		if (index >= 0) questionDrafts.splice(index, 1);
	}

	function moveQuestion(questionLocalId: string, direction: -1 | 1) {
		if (!canEditStructure) return;

		const index = questionDrafts.findIndex((question) => question.localId === questionLocalId);
		if (index < 0) return;

		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= questionDrafts.length) return;

		const [entry] = questionDrafts.splice(index, 1);
		questionDrafts.splice(nextIndex, 0, entry);
	}

	function addAnswer(questionLocalId: string) {
		if (!canEditStructure) return;

		const question = questionDrafts.find((entry) => entry.localId === questionLocalId);
		if (!question) return;

		question.answers.push(createAnswerDraft(question.answers.length));
	}

	function removeAnswer(questionLocalId: string, answerLocalId: string) {
		if (!canEditStructure) return;

		const question = questionDrafts.find((entry) => entry.localId === questionLocalId);
		if (!question || question.answers.length <= 2) return;

		const index = question.answers.findIndex((answer) => answer.localId === answerLocalId);
		if (index >= 0) question.answers.splice(index, 1);
	}

	function moveAnswer(questionLocalId: string, answerLocalId: string, direction: -1 | 1) {
		if (!canEditStructure) return;

		const question = questionDrafts.find((entry) => entry.localId === questionLocalId);
		if (!question) return;

		const index = question.answers.findIndex((answer) => answer.localId === answerLocalId);
		if (index < 0) return;

		const nextIndex = index + direction;
		if (nextIndex < 0 || nextIndex >= question.answers.length) return;

		const [entry] = question.answers.splice(index, 1);
		question.answers.splice(nextIndex, 0, entry);
	}

	function statusTagClass(status: QuestionStatus): 'info' | 'warning' | 'success' {
		if (status === 'active') return 'info';
		if (status === 'done') return 'success';
		return 'warning';
	}

	async function savePollEdits() {
		const currentPoll = poll;
		if (!auth.user || !currentPoll) {
			saveError = 'You must be signed in as the poll owner.';
			return;
		}

		saveError = null;
		saveNotice = null;
		isSaving = true;

		try {
			const tx: Array<any> = [
				...buildUpdatePollSettingsTx({
					pollId: currentPoll.id,
					title,
					allowRevoteWhileCollecting,
					participantResultsMode,
					isEmbedPublic
				})
			];

			if (canEditStructure) {
				if (!questionDrafts.length) {
					throw new Error('A poll must have at least one question.');
				}

				const existingQuestions = [...((currentPoll.questions ?? []) as PollRecord[])].sort(
					sortByOrder
				);
				const existingQuestionById = new Map<string, PollRecord>(
					existingQuestions.map((question) => [String(question.id), question])
				);
				const nextQuestionIds = new Set(
					questionDrafts
						.map((question) => question.id)
						.filter((questionId): questionId is string => Boolean(questionId))
				);

				for (const question of existingQuestions) {
					const questionId = String(question.id);
					if (!nextQuestionIds.has(questionId)) {
						tx.push(...buildDeleteQuestionTx(questionId));
					}
				}

				for (const [questionIndex, questionDraft] of questionDrafts.entries()) {
					const questionText = questionDraft.text.trim();
					if (!questionText) {
						throw new Error(`Question ${questionIndex + 1} text is required.`);
					}

					if (questionDraft.answers.length < 2) {
						throw new Error(`Question ${questionIndex + 1} needs at least two answers.`);
					}

					const normalizedAnswers = questionDraft.answers.map((answer, answerIndex) => {
						const answerText = answer.text.trim();
						if (!answerText) {
							throw new Error(
								`Answer ${answerIndex + 1} in question ${questionIndex + 1} cannot be empty.`
							);
						}

						const color = answer.color.trim();
						return {
							id: answer.id,
							text: answerText,
							color: color.length ? color : undefined
						};
					});

					if (questionDraft.id) {
						tx.push(
							...buildUpdateQuestionTx({
								questionId: questionDraft.id,
								text: questionText,
								order: questionIndex + 1
							})
						);

						const sourceQuestion = existingQuestionById.get(questionDraft.id);
						const existingAnswers = [...((sourceQuestion?.answers ?? []) as PollRecord[])].sort(
							sortByOrder
						);
						const nextAnswerIds = new Set(
							normalizedAnswers
								.map((answer) => answer.id)
								.filter((answerId): answerId is string => Boolean(answerId))
						);

						for (const existingAnswer of existingAnswers) {
							const answerId = String(existingAnswer.id);
							if (!nextAnswerIds.has(answerId)) {
								tx.push(...buildDeleteAnswerTx(answerId));
							}
						}

						for (const [answerIndex, answer] of normalizedAnswers.entries()) {
							if (answer.id) {
								tx.push(
									...buildUpdateAnswerTx({
										answerId: answer.id,
										text: answer.text,
										color: answer.color,
										order: answerIndex + 1
									})
								);
							} else {
								const createdAnswer = buildCreateAnswerTx({
									pollId: currentPoll.id,
									questionId: questionDraft.id,
									pollOwnerId: currentPoll.ownerId,
									text: answer.text,
									color: answer.color,
									order: answerIndex + 1
								});
								tx.push(...createdAnswer.tx);
							}
						}
					} else {
						const createdQuestion = buildAddQuestionTx({
							pollId: currentPoll.id,
							pollOwnerId: currentPoll.ownerId,
							text: questionText,
							answers: normalizedAnswers.map((answer) => ({
								text: answer.text,
								color: answer.color
							})),
							order: questionIndex + 1
						});
						tx.push(...createdQuestion.tx);
					}
				}
			}

			await db.transact(tx);
			saveNotice = 'Poll updates saved.';
		} catch (error) {
			saveError = error instanceof Error ? error.message : 'Unable to save poll updates.';
		} finally {
			isSaving = false;
		}
	}
</script>

{#if auth.isLoading}
	<p class="text-muted">Checking auth…</p>
{:else if !auth.user}
	<div class="callout warning">
		<p>Sign in to edit this poll.</p>
	</div>
{:else if query.isLoading}
	<p class="text-muted">Loading poll editor…</p>
{:else if query.error}
	<div class="callout error">
		<p>{query.error.message}</p>
	</div>
{:else if !poll}
	<div class="callout warning">
		<p><strong>Poll not found</strong></p>
		<p>You may not own this poll, or the id is invalid.</p>
	</div>
{:else}
	<form
		class="stack"
		onsubmit={(event) => {
			event.preventDefault();
			void savePollEdits();
		}}
	>
		<section class="box">
			<div class="stack">
				<div class="split">
					<h3 class="h5 no-margin">Poll settings</h3>
					<span class="chip">{questionDrafts.length} questions · {totalAnswers} answers</span>
				</div>
				<p class="text-muted no-margin">Status: <strong>{poll.status}</strong></p>

				<label class="row" for="poll-title-input">
					<span>Poll title</span>
					<input id="poll-title-input" bind:value={title} placeholder="e.g. JS Nation Live Poll" />
				</label>

				<label class="form-option-row">
					<input type="checkbox" bind:checked={allowRevoteWhileCollecting} />
					<span>Allow revote while collecting</span>
				</label>

				<label class="form-option-row">
					<input type="checkbox" bind:checked={isEmbedPublic} />
					<span>Public embed enabled</span>
				</label>

				<fieldset class="stack">
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

		{#if !canEditStructure}
			<div class="callout info">
				<p>
					Question structure is locked once a poll is live or closed. You can still edit title and
					session settings.
				</p>
			</div>
		{/if}

		<section class="stack">
			<div class="split">
				<h3 class="h5 no-margin">Questions</h3>
				<button class="button" type="button" disabled={!canEditStructure} onclick={addQuestion}>
					+ Add question
				</button>
			</div>

			{#each questionDrafts as question, questionIndex (question.localId)}
				<article class="box">
					<div class="stack">
						<div class="split">
							<div class="cluster">
								<h4 class="h5 no-margin">Question {questionIndex + 1}</h4>
								<span class={`tag ${statusTagClass(question.status)}`}>{question.status}</span>
							</div>
							<div class="cluster">
								<button
									class="button mini ghost"
									type="button"
									disabled={!canEditStructure || questionIndex === 0}
									onclick={() => moveQuestion(question.localId, -1)}
								>
									↑
								</button>
								<button
									class="button mini ghost"
									type="button"
									disabled={!canEditStructure || questionIndex === questionDrafts.length - 1}
									onclick={() => moveQuestion(question.localId, 1)}
								>
									↓
								</button>
								<button
									class="button mini ghost"
									type="button"
									disabled={!canEditStructure || questionDrafts.length <= 1}
									onclick={() => removeQuestion(question.localId)}
								>
									Remove
								</button>
							</div>
						</div>

						<label class="row" for={`question-${question.localId}`}>
							<span>Prompt</span>
							<textarea
								id={`question-${question.localId}`}
								bind:value={question.text}
								disabled={!canEditStructure}
								placeholder="Ask your multiple-choice question"
							></textarea>
						</label>

						<div class="stack">
							<div class="split">
								<h5 class="no-margin fs-s">Answers</h5>
								<button
									class="button mini"
									type="button"
									disabled={!canEditStructure}
									onclick={() => addAnswer(question.localId)}
								>
									+ Add answer
								</button>
							</div>

							{#each question.answers as answer, answerIndex (answer.localId)}
								<div class="cluster">
									<label class="stack full">
										<span class="visually-hidden">Answer {answerIndex + 1} text</span>
										<input
											bind:value={answer.text}
											disabled={!canEditStructure}
											placeholder={`Answer ${answerIndex + 1}`}
										/>
									</label>

									<label class="stack">
										<span class="visually-hidden">Answer {answerIndex + 1} color</span>
										<input type="color" bind:value={answer.color} disabled={!canEditStructure} />
									</label>

									<div class="cluster">
										<button
											class="button mini ghost"
											type="button"
											disabled={!canEditStructure || answerIndex === 0}
											onclick={() => moveAnswer(question.localId, answer.localId, -1)}
										>
											↑
										</button>
										<button
											class="button mini ghost"
											type="button"
											disabled={!canEditStructure || answerIndex === question.answers.length - 1}
											onclick={() => moveAnswer(question.localId, answer.localId, 1)}
										>
											↓
										</button>
										<button
											class="button mini ghost"
											type="button"
											disabled={!canEditStructure || question.answers.length <= 2}
											onclick={() => removeAnswer(question.localId, answer.localId)}
										>
											Remove
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</article>
			{/each}
		</section>

		<div class="form-actions">
			<button class="button" type="button" disabled={isSaving} onclick={resetChanges}
				>Reset changes</button
			>
			<button class="button primary" type="submit" disabled={isSaving}>
				{isSaving ? 'Saving…' : 'Save poll updates'}
			</button>
		</div>
	</form>
{/if}

{#if saveNotice}
	<div class="callout success">
		<p>{saveNotice}</p>
	</div>
{/if}

{#if saveError}
	<div class="callout error">
		<p>{saveError}</p>
	</div>
{/if}
