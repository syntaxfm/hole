import { id, type TransactionChunk } from '@instantdb/svelte';

import type { AppSchema } from '../../instant.schema';
import { db } from './client';

export type PollStatus = 'draft' | 'live' | 'closed';
export type PollPhase = 'collecting' | 'locked' | 'revealed';
export type ParticipantResultsMode = 'count_only' | 'full';
export type QuestionStatus = 'queued' | 'active' | 'done';

export type AppTxChunk = TransactionChunk<AppSchema, keyof AppSchema['entities']>;

export type NewAnswerInput = {
	text: string;
	color?: string;
};

export type NewQuestionInput = {
	text: string;
	answers: NewAnswerInput[];
};

export type CreatePollInput = {
	ownerId: string;
	title: string;
	questions: NewQuestionInput[];
	startLive?: boolean;
	allowRevoteWhileCollecting?: boolean;
	participantResultsMode?: ParticipantResultsMode;
	isEmbedPublic?: boolean;
};

export type AddQuestionInput = {
	pollId: string;
	pollOwnerId: string;
	text: string;
	answers: NewAnswerInput[];
	order: number;
};

export type CastOrRevoteInput = {
	pollId: string;
	questionId: string;
	pollOwnerId: string;
	answerId: string;
	voterId: string;
	existingVoteId?: string;
	participantSessionId?: string;
};

export type RecomputeStatsInput = {
	pollId: string;
	questionId: string;
	pollOwnerId: string;
	answerIds: string[];
	votes: Array<{ answerId: string }>;
	revealedAt?: number;
};

export type StartPollInput = {
	pollId: string;
	firstQuestionId: string;
	firstOrder: number;
};

export type LockQuestionInput = {
	pollId: string;
};

export type RevealQuestionInput = {
	pollId: string;
	questionId: string;
};

export type AdvanceQuestionInput = {
	pollId: string;
	currentQuestionId: string;
	nextQuestionId: string;
	nextOrder: number;
	participantSessionIdsToReset?: string[];
};

export type ClosePollInput = {
	pollId: string;
	currentQuestionId?: string;
};

export type CreateParticipantSessionInput = {
	pollId: string;
	pollOwnerId: string;
	userId: string;
	activeQuestionId?: string;
};

export type TouchParticipantSessionInput = {
	sessionId: string;
	activeQuestionId?: string;
	hasVotedActive?: boolean;
};

export function voterQuestionKey(voterId: string, questionId: string): string {
	return `${voterId}:${questionId}`;
}

export function pollUserKey(pollId: string, userId: string): string {
	return `${pollId}:${userId}`;
}

function nowTs(): number {
	return Date.now();
}

function requireNonEmpty(value: string, label: string): string {
	const next = value.trim();
	if (!next) throw new Error(`${label} is required`);
	return next;
}

function normalizeAnswers(answers: NewAnswerInput[]): NewAnswerInput[] {
	const normalized = answers
		.map((answer) => ({
			text: answer.text.trim(),
			color: answer.color?.trim()
		}))
		.filter((answer) => answer.text.length > 0);

	if (normalized.length < 2) {
		throw new Error('Each multiple-choice question must have at least 2 answers.');
	}

	return normalized;
}

/**
 * 1) Create poll + all questions + all answers + initial stats.
 */
export function buildCreatePollTx(input: CreatePollInput): {
	pollId: string;
	questionIds: string[];
	answerIdsByQuestionId: Record<string, string[]>;
	tx: AppTxChunk[];
} {
	const createdAt = nowTs();
	const pollId = id();
	const title = requireNonEmpty(input.title, 'Poll title');
	const startLive = input.startLive ?? false;
	const participantResultsMode = input.participantResultsMode ?? 'count_only';

	if (!input.questions.length) {
		throw new Error('A poll must have at least one question.');
	}

	const questions = input.questions.map((question, questionIndex) => {
		const questionId = id();
		const normalizedAnswers = normalizeAnswers(question.answers);
		const answerIds = normalizedAnswers.map(() => id());

		return {
			questionId,
			text: requireNonEmpty(question.text, `Question ${questionIndex + 1} text`),
			order: questionIndex + 1,
			status: (startLive && questionIndex === 0 ? 'active' : 'queued') as QuestionStatus,
			answers: normalizedAnswers.map((answer, answerIndex) => ({
				id: answerIds[answerIndex],
				text: answer.text,
				order: answerIndex + 1,
				color: answer.color
			})),
			countsByAnswer: Object.fromEntries(answerIds.map((answerId) => [answerId, 0]))
		};
	});

	const activeQuestionId = startLive ? questions[0].questionId : undefined;
	const activeOrder = startLive ? 1 : undefined;
	const status: PollStatus = startLive ? 'live' : 'draft';
	const activePhase: PollPhase = startLive ? 'collecting' : 'locked';

	const pollCreate = db.tx.polls[pollId].create({
		title,
		ownerId: input.ownerId,
		status,
		activePhase,
		allowRevoteWhileCollecting: input.allowRevoteWhileCollecting ?? true,
		participantResultsMode,
		isEmbedPublic: input.isEmbedPublic ?? true,
		createdAt,
		updatedAt: createdAt,
		...(activeQuestionId ? { activeQuestionId, activeOrder } : {})
	});

	const tx: AppTxChunk[] = [pollCreate, db.tx.polls[pollId].link({ owner: input.ownerId })];
	const answerIdsByQuestionId: Record<string, string[]> = {};

	for (const question of questions) {
		answerIdsByQuestionId[question.questionId] = question.answers.map((answer) => answer.id);

		tx.push(
			db.tx.questions[question.questionId].create({
				pollId,
				pollOwnerId: input.ownerId,
				text: question.text,
				order: question.order,
				status: question.status,
				type: 'multiple_choice',
				createdAt,
				updatedAt: createdAt
			}),
			db.tx.questions[question.questionId].link({ poll: pollId })
		);

		for (const answer of question.answers) {
			tx.push(
				db.tx.answers[answer.id].create({
					pollId,
					questionId: question.questionId,
					pollOwnerId: input.ownerId,
					text: answer.text,
					order: answer.order,
					...(answer.color ? { color: answer.color } : {}),
					createdAt
				}),
				db.tx.answers[answer.id].link({ question: question.questionId })
			);
		}

		tx.push(
			db.tx.question_stats[id()].create({
				pollId,
				questionId: question.questionId,
				pollOwnerId: input.ownerId,
				totalVotes: 0,
				countsByAnswer: question.countsByAnswer,
				updatedAt: createdAt
			}),
			db.tx.question_stats.lookup('questionId', question.questionId).link({ poll: pollId }),
			db.tx.question_stats
				.lookup('questionId', question.questionId)
				.link({ question: question.questionId })
		);
	}

	return {
		pollId,
		questionIds: questions.map((question) => question.questionId),
		answerIdsByQuestionId,
		tx
	};
}

export async function createPoll(input: CreatePollInput) {
	const result = buildCreatePollTx(input);
	await db.transact(result.tx);
	return result;
}

/**
 * 2) Add one queued question + answers + initial stats to an existing poll.
 */
export function buildAddQuestionTx(input: AddQuestionInput): {
	questionId: string;
	answerIds: string[];
	tx: AppTxChunk[];
} {
	const createdAt = nowTs();
	const questionId = id();
	const text = requireNonEmpty(input.text, 'Question text');
	const answers = normalizeAnswers(input.answers);
	const answerIds = answers.map(() => id());

	const countsByAnswer = Object.fromEntries(answerIds.map((answerId) => [answerId, 0]));

	const tx: AppTxChunk[] = [
		db.tx.questions[questionId].create({
			pollId: input.pollId,
			pollOwnerId: input.pollOwnerId,
			text,
			order: input.order,
			status: 'queued',
			type: 'multiple_choice',
			createdAt,
			updatedAt: createdAt
		}),
		db.tx.questions[questionId].link({ poll: input.pollId })
	];

	for (const [index, answer] of answers.entries()) {
		tx.push(
			db.tx.answers[answerIds[index]].create({
				pollId: input.pollId,
				questionId,
				pollOwnerId: input.pollOwnerId,
				text: answer.text,
				order: index + 1,
				...(answer.color ? { color: answer.color } : {}),
				createdAt
			}),
			db.tx.answers[answerIds[index]].link({ question: questionId })
		);
	}

	tx.push(
		db.tx.question_stats[id()].create({
			pollId: input.pollId,
			questionId,
			pollOwnerId: input.pollOwnerId,
			totalVotes: 0,
			countsByAnswer,
			updatedAt: createdAt
		}),
		db.tx.question_stats.lookup('questionId', questionId).link({ poll: input.pollId }),
		db.tx.question_stats.lookup('questionId', questionId).link({ question: questionId })
	);

	return { questionId, answerIds, tx };
}

/**
 * 3) Create vote (first cast) or revote (update answer) for one user.
 */
export function buildCastOrRevoteTx(input: CastOrRevoteInput): AppTxChunk[] {
	const updatedAt = nowTs();
	const voteKey = voterQuestionKey(input.voterId, input.questionId);

	const tx: AppTxChunk[] = [];

	if (input.existingVoteId) {
		tx.push(
			db.tx.votes[input.existingVoteId].update(
				{
					answerId: input.answerId,
					updatedAt
				},
				{ upsert: false }
			)
		);
	} else {
		const voteId = id();
		tx.push(
			db.tx.votes[voteId].create({
				pollId: input.pollId,
				questionId: input.questionId,
				pollOwnerId: input.pollOwnerId,
				answerId: input.answerId,
				voterId: input.voterId,
				voterQuestionKey: voteKey,
				createdAt: updatedAt,
				updatedAt
			}),
			db.tx.votes[voteId].link({ poll: input.pollId }),
			db.tx.votes[voteId].link({ question: input.questionId }),
			db.tx.votes[voteId].link({ voter: input.voterId })
		);
	}

	if (input.participantSessionId) {
		tx.push(
			db.tx.participant_sessions[input.participantSessionId].update(
				{
					activeQuestionId: input.questionId,
					hasVotedActive: true,
					lastSeenAt: updatedAt
				},
				{ upsert: false }
			)
		);
	}

	return tx;
}

/**
 * 4) Recompute and write question_stats from a current vote snapshot.
 *
 * Use this after reading all votes for the question. This avoids fragile client-side
 * increment/decrement races and makes stats eventually consistent with votes.
 */
export function buildRecomputeQuestionStatsTx(input: RecomputeStatsInput): AppTxChunk[] {
	const updatedAt = nowTs();
	const countsByAnswer = Object.fromEntries(input.answerIds.map((answerId) => [answerId, 0]));

	for (const vote of input.votes) {
		if (vote.answerId in countsByAnswer) {
			countsByAnswer[vote.answerId] = Number(countsByAnswer[vote.answerId]) + 1;
		}
	}

	return [
		db.tx.question_stats.lookup('questionId', input.questionId).update(
			{
				totalVotes: input.votes.length,
				countsByAnswer,
				updatedAt,
				...(input.revealedAt ? { revealedAt: input.revealedAt } : {})
			},
			{ upsert: false }
		)
	];
}

/**
 * 5) Drive actions
 */
export function buildStartPollTx(input: StartPollInput): AppTxChunk[] {
	const updatedAt = nowTs();

	return [
		db.tx.polls[input.pollId].update(
			{
				status: 'live',
				activeQuestionId: input.firstQuestionId,
				activeOrder: input.firstOrder,
				activePhase: 'collecting',
				updatedAt,
				lockedAt: null,
				revealedAt: null
			},
			{ upsert: false }
		),
		db.tx.questions[input.firstQuestionId].update(
			{
				status: 'active',
				updatedAt
			},
			{ upsert: false }
		)
	];
}

export function buildLockQuestionTx(input: LockQuestionInput): AppTxChunk[] {
	const updatedAt = nowTs();

	return [
		db.tx.polls[input.pollId].update(
			{
				activePhase: 'locked',
				lockedAt: updatedAt,
				updatedAt
			},
			{ upsert: false }
		)
	];
}

export function buildRevealQuestionTx(input: RevealQuestionInput): AppTxChunk[] {
	const updatedAt = nowTs();

	return [
		db.tx.polls[input.pollId].update(
			{
				activePhase: 'revealed',
				revealedAt: updatedAt,
				updatedAt
			},
			{ upsert: false }
		),
		db.tx.question_stats.lookup('questionId', input.questionId).update(
			{
				revealedAt: updatedAt,
				updatedAt
			},
			{ upsert: false }
		)
	];
}

export function buildAdvanceQuestionTx(input: AdvanceQuestionInput): AppTxChunk[] {
	const updatedAt = nowTs();

	const tx: AppTxChunk[] = [
		db.tx.questions[input.currentQuestionId].update(
			{
				status: 'done',
				updatedAt
			},
			{ upsert: false }
		),
		db.tx.questions[input.nextQuestionId].update(
			{
				status: 'active',
				updatedAt
			},
			{ upsert: false }
		),
		db.tx.polls[input.pollId].update(
			{
				status: 'live',
				activeQuestionId: input.nextQuestionId,
				activeOrder: input.nextOrder,
				activePhase: 'collecting',
				updatedAt,
				lockedAt: null,
				revealedAt: null
			},
			{ upsert: false }
		)
	];

	for (const participantSessionId of input.participantSessionIdsToReset ?? []) {
		tx.push(
			db.tx.participant_sessions[participantSessionId].update(
				{
					activeQuestionId: input.nextQuestionId,
					hasVotedActive: false,
					lastSeenAt: updatedAt
				},
				{ upsert: false }
			)
		);
	}

	return tx;
}

export function buildClosePollTx(input: ClosePollInput): AppTxChunk[] {
	const updatedAt = nowTs();
	const tx: AppTxChunk[] = [
		db.tx.polls[input.pollId].update(
			{
				status: 'closed',
				activePhase: 'locked',
				updatedAt
			},
			{ upsert: false }
		)
	];

	if (input.currentQuestionId) {
		tx.push(
			db.tx.questions[input.currentQuestionId].update(
				{
					status: 'done',
					updatedAt
				},
				{ upsert: false }
			)
		);
	}

	return tx;
}

/**
 * 6) Participant session helpers.
 */
export function buildCreateParticipantSessionTx(input: CreateParticipantSessionInput): {
	sessionId: string;
	tx: AppTxChunk[];
} {
	const joinedAt = nowTs();
	const sessionId = id();

	const tx: AppTxChunk[] = [
		db.tx.participant_sessions[sessionId].create({
			pollId: input.pollId,
			pollOwnerId: input.pollOwnerId,
			userId: input.userId,
			pollUserKey: pollUserKey(input.pollId, input.userId),
			...(input.activeQuestionId ? { activeQuestionId: input.activeQuestionId } : {}),
			hasVotedActive: false,
			joinedAt,
			lastSeenAt: joinedAt
		}),
		db.tx.participant_sessions[sessionId].link({ poll: input.pollId }),
		db.tx.participant_sessions[sessionId].link({ user: input.userId })
	];

	return { sessionId, tx };
}

export function buildTouchParticipantSessionTx(input: TouchParticipantSessionInput): AppTxChunk[] {
	return [
		db.tx.participant_sessions[input.sessionId].update(
			{
				...(input.activeQuestionId ? { activeQuestionId: input.activeQuestionId } : {}),
				...(input.hasVotedActive !== undefined ? { hasVotedActive: input.hasVotedActive } : {}),
				lastSeenAt: nowTs()
			},
			{ upsert: false }
		)
	];
}
