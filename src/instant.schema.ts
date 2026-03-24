// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/svelte';

const _schema = i.schema({
	entities: {
		$files: i.entity({
			path: i.string().unique().indexed(),
			url: i.string()
		}),
		$streams: i.entity({
			abortReason: i.string().optional(),
			clientId: i.string().unique().indexed(),
			done: i.boolean().optional(),
			size: i.number().optional()
		}),
		$users: i.entity({
			email: i.string().unique().indexed().optional(),
			imageURL: i.string().optional(),
			role: i.string().indexed().optional(),
			displayName: i.string().optional(),
			createdAt: i.date().indexed().optional()
		}),

		polls: i.entity({
			title: i.string().indexed(),
			ownerId: i.string().indexed(),
			status: i.string().indexed(), // draft | live | closed
			activeQuestionId: i.string().optional().indexed(),
			activeOrder: i.number().optional().indexed(),
			activePhase: i.string().indexed(), // collecting | locked | revealed
			allowRevoteWhileCollecting: i.boolean().indexed(),
			participantResultsMode: i.string().indexed(), // count_only | full
			isEmbedPublic: i.boolean().indexed(),
			createdAt: i.date().indexed(),
			updatedAt: i.date().indexed(),
			lockedAt: i.date().optional().indexed(),
			revealedAt: i.date().optional().indexed()
		}),

		questions: i.entity({
			pollId: i.string().indexed(),
			pollOwnerId: i.string().indexed(),
			text: i.string(),
			order: i.number().indexed(),
			status: i.string().indexed(), // queued | active | done
			type: i.string().indexed(), // multiple_choice
			createdAt: i.date().indexed(),
			updatedAt: i.date().indexed()
		}),

		answers: i.entity({
			pollId: i.string().indexed(),
			questionId: i.string().indexed(),
			pollOwnerId: i.string().indexed(),
			text: i.string(),
			order: i.number().indexed(),
			color: i.string().optional(),
			createdAt: i.date().indexed()
		}),

		votes: i.entity({
			pollId: i.string().indexed(),
			questionId: i.string().indexed(),
			pollOwnerId: i.string().indexed(),
			answerId: i.string().indexed(),
			voterId: i.string().indexed(),
			voterQuestionKey: i.string().unique().indexed(), // `${voterId}:${questionId}`
			createdAt: i.date().indexed(),
			updatedAt: i.date().indexed()
		}),

		question_stats: i.entity({
			pollId: i.string().indexed(),
			questionId: i.string().unique().indexed(),
			pollOwnerId: i.string().indexed(),
			totalVotes: i.number().indexed(),
			countsByAnswer: i.json(),
			updatedAt: i.date().indexed(),
			revealedAt: i.date().optional().indexed()
		}),

		participant_sessions: i.entity({
			pollId: i.string().indexed(),
			pollOwnerId: i.string().indexed(),
			userId: i.string().indexed(),
			pollUserKey: i.string().unique().indexed(), // `${pollId}:${userId}`
			activeQuestionId: i.string().optional().indexed(),
			hasVotedActive: i.boolean().indexed(),
			joinedAt: i.date().indexed(),
			lastSeenAt: i.date().indexed()
		})
	},
	links: {
		$streams$files: {
			forward: {
				on: '$streams',
				has: 'many',
				label: '$files'
			},
			reverse: {
				on: '$files',
				has: 'one',
				label: '$stream',
				onDelete: 'cascade'
			}
		},
		$usersLinkedPrimaryUser: {
			forward: {
				on: '$users',
				has: 'one',
				label: 'linkedPrimaryUser',
				onDelete: 'cascade'
			},
			reverse: {
				on: '$users',
				has: 'many',
				label: 'linkedGuestUsers'
			}
		},

		pollOwner: {
			forward: {
				on: 'polls',
				has: 'one',
				label: 'owner',
				required: true
			},
			reverse: {
				on: '$users',
				has: 'many',
				label: 'ownedPolls'
			}
		},
		questionPoll: {
			forward: {
				on: 'questions',
				has: 'one',
				label: 'poll',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'polls',
				has: 'many',
				label: 'questions'
			}
		},
		answerQuestion: {
			forward: {
				on: 'answers',
				has: 'one',
				label: 'question',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'questions',
				has: 'many',
				label: 'answers'
			}
		},
		votePoll: {
			forward: {
				on: 'votes',
				has: 'one',
				label: 'poll',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'polls',
				has: 'many',
				label: 'votes'
			}
		},
		voteQuestion: {
			forward: {
				on: 'votes',
				has: 'one',
				label: 'question',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'questions',
				has: 'many',
				label: 'votes'
			}
		},
		voteVoter: {
			forward: {
				on: 'votes',
				has: 'one',
				label: 'voter',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: '$users',
				has: 'many',
				label: 'votes'
			}
		},
		statPoll: {
			forward: {
				on: 'question_stats',
				has: 'one',
				label: 'poll',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'polls',
				has: 'many',
				label: 'questionStats'
			}
		},
		statQuestion: {
			forward: {
				on: 'question_stats',
				has: 'one',
				label: 'question',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'questions',
				has: 'one',
				label: 'stats'
			}
		},
		participantPoll: {
			forward: {
				on: 'participant_sessions',
				has: 'one',
				label: 'poll',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: 'polls',
				has: 'many',
				label: 'participantSessions'
			}
		},
		participantUser: {
			forward: {
				on: 'participant_sessions',
				has: 'one',
				label: 'user',
				required: true,
				onDelete: 'cascade'
			},
			reverse: {
				on: '$users',
				has: 'many',
				label: 'participantSessions'
			}
		}
	},
	rooms: {}
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
