// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/svelte';
import type { AppSchema } from './instant.schema';

const rules = {
	$default: {
		allow: {
			$default: 'false'
		}
	},
	attrs: {
		allow: {
			create: 'false'
		}
	},

	$users: {
		allow: {
			view: 'auth.id == data.id',
			create: 'noRoleOnCreate',
			update: 'isSelf && onlySafeUserFields',
			delete: 'false'
		},
		fields: {
			role: 'auth.id == data.id'
		},
		bind: {
			isSelf: 'auth.id == data.id',
			noRoleOnCreate: "!('role' in request.modifiedFields)",
			onlySafeUserFields: "request.modifiedFields.all(field, field in ['displayName', 'imageURL'])"
		}
	},

	$files: {
		allow: {
			$default: 'false'
		}
	},

	$streams: {
		allow: {
			$default: 'false'
		}
	},

	polls: {
		allow: {
			view: 'isOwner || isPublicPoll',
			create: 'isSelfOwnedCreate && validEnums',
			update: 'isOwner && ownerUnchanged && validEnums',
			delete: 'isOwner',
			link: {
				owner: 'isOwner'
			},
			unlink: {
				owner: 'false'
			}
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isOwner: 'isAdminRole && auth.id != null && auth.id == data.ownerId',
			isSelfOwnedCreate: 'isAdminRole && auth.id != null && auth.id == data.ownerId',
			isPublicPoll: "data.status in ['live', 'closed']",
			ownerUnchanged: "!('ownerId' in request.modifiedFields) || newData.ownerId == data.ownerId",
			validEnums:
				"data.status in ['draft', 'live', 'closed'] && data.activePhase in ['collecting', 'locked', 'revealed'] && data.participantResultsMode in ['count_only', 'full']"
		}
	},

	questions: {
		allow: {
			view: 'isPollOwner || isParticipantVisible',
			create: 'isPollOwner && validStatus && validType',
			update: 'isPollOwner && immutableOwnership && validStatus && validType',
			delete: 'isPollOwner',
			link: {
				poll: 'isPollOwner && linksMatchPoll'
			},
			unlink: {
				poll: 'isPollOwner'
			}
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isPollOwner: 'isAdminRole && auth.id != null && auth.id == data.pollOwnerId',
			isParticipantVisible: "data.status in ['active', 'done']",
			validStatus: "data.status in ['queued', 'active', 'done']",
			validType: "data.type in ['multiple_choice']",
			immutableOwnership:
				"!('pollId' in request.modifiedFields) && !('pollOwnerId' in request.modifiedFields)",
			linksMatchPoll:
				"data.pollId in data.ref('poll.id') && data.pollOwnerId in data.ref('poll.ownerId')"
		}
	},

	answers: {
		allow: {
			view: 'isPollOwner || questionVisible',
			create: 'isPollOwner',
			update: 'isPollOwner && immutableOwnership',
			delete: 'isPollOwner',
			link: {
				question: 'isPollOwner && linksMatchQuestion'
			},
			unlink: {
				question: 'isPollOwner'
			}
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isPollOwner: 'isAdminRole && auth.id != null && auth.id == data.pollOwnerId',
			questionVisible:
				"('active' in data.ref('question.status')) || ('done' in data.ref('question.status'))",
			immutableOwnership:
				"!('pollId' in request.modifiedFields) && !('questionId' in request.modifiedFields) && !('pollOwnerId' in request.modifiedFields)",
			linksMatchQuestion:
				"data.questionId in data.ref('question.id') && data.pollId in data.ref('question.pollId') && data.pollOwnerId in data.ref('question.pollOwnerId')"
		}
	},

	votes: {
		allow: {
			view: 'isPollOwner || isVoter',
			create:
				'isVoter && isCollecting && isQuestionActive && questionBelongsToPoll && answerBelongsToQuestion',
			update:
				'isVoter && isCollecting && isQuestionActive && onlyRevoteFields && immutableVoteScope && answerBelongsToQuestion',
			delete: 'isPollOwner',
			link: {
				poll: "isVoter && isCollecting && data.pollId in data.ref('poll.id')",
				question:
					"isVoter && isCollecting && isQuestionActive && data.questionId in data.ref('question.id') && questionBelongsToPoll",
				voter: "isVoter && isCollecting && auth.id in data.ref('voter.id')"
			},
			unlink: {
				poll: 'false',
				question: 'false',
				voter: 'false'
			}
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isVoter: 'auth.id != null && auth.id == data.voterId',
			isPollOwner: 'isAdminRole && auth.id != null && auth.id == data.pollOwnerId',
			isCollecting: "'collecting' in data.ref('poll.activePhase')",
			isQuestionActive: "'active' in data.ref('question.status')",
			questionBelongsToPoll: "data.pollId in data.ref('question.pollId')",
			answerBelongsToQuestion: "data.answerId in data.ref('question.answers.id')",
			onlyRevoteFields: "request.modifiedFields.all(field, field in ['answerId', 'updatedAt'])",
			immutableVoteScope:
				"!('pollId' in request.modifiedFields) && !('questionId' in request.modifiedFields) && !('pollOwnerId' in request.modifiedFields) && !('voterId' in request.modifiedFields) && !('voterQuestionKey' in request.modifiedFields)"
		}
	},

	question_stats: {
		allow: {
			view: 'isPollOwner || pollVisible',
			create: 'isPollOwner',
			update: 'isPollOwner && immutableScope',
			delete: 'isPollOwner',
			link: {
				poll: "isPollOwner && data.pollId in data.ref('poll.id')",
				question: "isPollOwner && data.questionId in data.ref('question.id')"
			},
			unlink: {
				poll: 'false',
				question: 'false'
			}
		},
		fields: {
			countsByAnswer: 'isPollOwner || canViewBreakdown'
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isPollOwner: 'isAdminRole && auth.id != null && auth.id == data.pollOwnerId',
			pollVisible: "('live' in data.ref('poll.status')) || ('closed' in data.ref('poll.status'))",
			canViewBreakdown:
				"('revealed' in data.ref('poll.activePhase')) && ('full' in data.ref('poll.participantResultsMode'))",
			immutableScope:
				"!('pollId' in request.modifiedFields) && !('questionId' in request.modifiedFields) && !('pollOwnerId' in request.modifiedFields)"
		}
	},

	participant_sessions: {
		allow: {
			view: 'isPollOwner || isSelf',
			create: 'isSelf && pollVisible',
			update: 'isSelf && pollVisible && onlyPresenceFields && immutableScope',
			delete: 'isSelf || isPollOwner',
			link: {
				poll: "isSelf && data.pollId in data.ref('poll.id')",
				user: "isSelf && auth.id in data.ref('user.id')"
			},
			unlink: {
				poll: 'false',
				user: 'false'
			}
		},
		bind: {
			isAdminRole: "'admin' in auth.ref('$user.role')",
			isSelf: 'auth.id != null && auth.id == data.userId',
			isPollOwner: 'isAdminRole && auth.id != null && auth.id == data.pollOwnerId',
			pollVisible: "('live' in data.ref('poll.status')) || ('closed' in data.ref('poll.status'))",
			onlyPresenceFields:
				"request.modifiedFields.all(field, field in ['lastSeenAt', 'hasVotedActive', 'activeQuestionId'])",
			immutableScope:
				"!('pollId' in request.modifiedFields) && !('pollOwnerId' in request.modifiedFields) && !('userId' in request.modifiedFields) && !('pollUserKey' in request.modifiedFields)"
		}
	}
} satisfies InstantRules<AppSchema>;

export default rules;
