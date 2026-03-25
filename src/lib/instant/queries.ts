import type { ValidQuery } from '@instantdb/svelte';

import type { AppSchema } from '../../instant.schema';

export type AppQuery<Q extends ValidQuery<Q, AppSchema>> = Q;

/**
 * Admin landing route: /admin
 *
 * - Current user's owned polls
 * - Questions and stats for quick dashboard counts
 */
export function adminPollsQuery(ownerId: string): AppQuery<{
	polls: {
		$: {
			where: { ownerId: string };
			order: { updatedAt: 'desc' };
			limit: 50;
		};
		questions: {
			$: {
				order: { order: 'asc' };
			};
		};
		questionStats: {};
	};
}> {
	return {
		polls: {
			$: {
				where: { ownerId },
				order: { updatedAt: 'desc' },
				limit: 50
			},
			questions: {
				$: {
					order: { order: 'asc' }
				}
			},
			questionStats: {}
		}
	};
}

/**
 * Participant route: /poll/[pollId]
 *
 * - Poll metadata and drive state
 * - Questions + options (ordered)
 * - Active user's session + own votes
 */
export function participantPollQuery(
	pollId: string,
	viewerId: string
): AppQuery<{
	polls: {
		$: {
			where: { id: string };
			limit: 1;
		};
		questions: {
			$: {
				order: { order: 'asc' };
			};
			answers: {
				$: {
					order: { order: 'asc' };
				};
			};
			stats: {};
		};
	};
	participant_sessions: {
		$: {
			where: { pollId: string; userId: string };
			limit: 1;
		};
	};
	votes: {
		$: {
			where: { pollId: string; voterId: string };
			order: { updatedAt: 'desc' };
		};
	};
}> {
	return {
		polls: {
			$: {
				where: { id: pollId },
				limit: 1
			},
			questions: {
				$: {
					order: { order: 'asc' }
				},
				answers: {
					$: {
						order: { order: 'asc' }
					}
				},
				stats: {}
			}
		},
		participant_sessions: {
			$: {
				where: {
					pollId,
					userId: viewerId
				},
				limit: 1
			}
		},
		votes: {
			$: {
				where: {
					pollId,
					voterId: viewerId
				},
				order: { updatedAt: 'desc' }
			}
		}
	};
}

/**
 * Admin drive route: /admin/poll/[pollId]/drive
 *
 * - Poll + all questions/options/stats
 * - All participant sessions for progress boards
 * - Recent vote feed (optional)
 */
export function adminDriveQuery(
	pollId: string,
	ownerId: string
): AppQuery<{
	polls: {
		$: {
			where: { id: string; ownerId: string };
			limit: 1;
		};
		questions: {
			$: {
				order: { order: 'asc' };
			};
			answers: {
				$: {
					order: { order: 'asc' };
				};
			};
			stats: {};
		};
		questionStats: {
			$: {
				order: { updatedAt: 'desc' };
			};
		};
	};
	participant_sessions: {
		$: {
			where: { pollId: string; pollOwnerId: string };
			order: { lastSeenAt: 'desc' };
			limit: 500;
		};
	};
	votes: {
		$: {
			where: { pollId: string; pollOwnerId: string };
			order: { updatedAt: 'desc' };
			limit: 500;
		};
	};
}> {
	return {
		polls: {
			$: {
				where: {
					id: pollId,
					ownerId
				},
				limit: 1
			},
			questions: {
				$: {
					order: { order: 'asc' }
				},
				answers: {
					$: {
						order: { order: 'asc' }
					}
				},
				stats: {}
			},
			questionStats: {
				$: {
					order: { updatedAt: 'desc' }
				}
			}
		},
		participant_sessions: {
			$: {
				where: {
					pollId,
					pollOwnerId: ownerId
				},
				order: { lastSeenAt: 'desc' },
				limit: 500
			}
		},
		votes: {
			$: {
				where: {
					pollId,
					pollOwnerId: ownerId
				},
				order: { updatedAt: 'desc' },
				limit: 500
			}
		}
	};
}

/**
 * Admin edit route: /admin/poll/[pollId]/edit
 *
 * - Poll-level settings
 * - Ordered questions and answers for editor controls
 */
export function adminPollEditQuery(
	pollId: string,
	ownerId: string
): AppQuery<{
	polls: {
		$: {
			where: { id: string; ownerId: string };
			limit: 1;
		};
		questions: {
			$: {
				order: { order: 'asc' };
			};
			answers: {
				$: {
					order: { order: 'asc' };
				};
			};
		};
	};
}> {
	return {
		polls: {
			$: {
				where: {
					id: pollId,
					ownerId
				},
				limit: 1
			},
			questions: {
				$: {
					order: { order: 'asc' }
				},
				answers: {
					$: {
						order: { order: 'asc' }
					}
				}
			}
		}
	};
}

/**
 * Embed route: /embed/poll/[pollId]
 *
 * Public, lightweight query for live or closed polls.
 */
export function embedLivePollQuery(pollId: string): AppQuery<{
	polls: {
		$: {
			where: {
				id: string;
				status: { $in: ['live', 'closed'] };
				isEmbedPublic: true;
			};
			limit: 1;
		};
		questions: {
			$: {
				where: {
					status: { $in: ['active', 'done'] };
				};
				order: { order: 'asc' };
			};
			answers: {
				$: {
					order: { order: 'asc' };
				};
			};
			stats: {};
		};
	};
}> {
	return {
		polls: {
			$: {
				where: {
					id: pollId,
					status: { $in: ['live', 'closed'] },
					isEmbedPublic: true
				},
				limit: 1
			},
			questions: {
				$: {
					where: {
						status: { $in: ['active', 'done'] }
					},
					order: { order: 'asc' }
				},
				answers: {
					$: {
						order: { order: 'asc' }
					}
				},
				stats: {}
			}
		}
	};
}

/**
 * Fixed-question embed route: /embed/poll/[pollId]/[questionId]
 */
export function embedQuestionQuery(
	pollId: string,
	questionId: string
): AppQuery<{
	polls: {
		$: {
			where: {
				id: string;
				status: { $in: ['live', 'closed'] };
				isEmbedPublic: true;
			};
			limit: 1;
		};
	};
	questions: {
		$: {
			where: { id: string; pollId: string };
			limit: 1;
		};
		answers: {
			$: {
				order: { order: 'asc' };
			};
		};
		stats: {};
	};
}> {
	return {
		polls: {
			$: {
				where: {
					id: pollId,
					status: { $in: ['live', 'closed'] },
					isEmbedPublic: true
				},
				limit: 1
			}
		},
		questions: {
			$: {
				where: {
					id: questionId,
					pollId
				},
				limit: 1
			},
			answers: {
				$: {
					order: { order: 'asc' }
				}
			},
			stats: {}
		}
	};
}
