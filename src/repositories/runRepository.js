/**
 * RUN REPOSITORY
 * 
 * Hanterar all kommunikation med Cloudflare backend API för spelrundor.
 * Migrerad från Firestore till Cloudflare D1 database via API endpoints.
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const normalizeTimestamp = (value) => {
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  return value;
};

const unpackRouteMeta = (routeValue) => {
  if (!routeValue || typeof routeValue !== 'object' || Array.isArray(routeValue)) {
    return { route: routeValue, meta: null };
  }

  const path = Array.isArray(routeValue.path)
    ? routeValue.path
    : Array.isArray(routeValue.route)
      ? routeValue.route
      : null;
  const meta = routeValue.meta || (!path ? routeValue : null);

  return { route: path, meta };
};

const normalizeRun = (run) => {
  if (!run) return run;
  const questionIds = run.questionIds || run.question_ids || [];
  const joinCode = run.joinCode || run.join_code || null;
  const createdAt = run.createdAt ?? normalizeTimestamp(run.created_at);
  const updatedAt = run.updatedAt ?? normalizeTimestamp(run.updated_at);
  const { route, meta } = unpackRouteMeta(run.route);
  const type = run.type || meta?.type || meta?.runType || null;
  const paymentPolicy = run.paymentPolicy ?? run.payment_policy ?? null;
  const paymentStatus = run.paymentStatus ?? run.payment_status ?? null;
  const paymentTotalAmount = run.paymentTotalAmount ?? run.payment_total_amount ?? null;
  const paymentHostAmount = run.paymentHostAmount ?? run.payment_host_amount ?? null;
  const paymentPlayerAmount = run.paymentPlayerAmount ?? run.payment_player_amount ?? null;
  const paymentCurrency = run.paymentCurrency ?? run.payment_currency ?? null;
  const paymentProviderId = run.paymentProviderId ?? run.payment_provider_id ?? null;
  const expectedPlayers = run.expectedPlayers ?? run.expected_players ?? null;
  const anonymousPolicy = run.anonymousPolicy ?? run.anonymous_policy ?? null;
  const maxAnonymous = run.maxAnonymous ?? run.max_anonymous ?? null;
  const hostPaymentId = run.hostPaymentId ?? run.host_payment_id ?? null;
  const allowAnonymous = anonymousPolicy ? anonymousPolicy !== 'block' : run.allowAnonymous ?? meta?.allowAnonymous ?? null;

  return {
    ...run,
    joinCode,
    questionIds,
    createdAt,
    updatedAt,
    route,
    type,
    createdBy: run.createdBy ?? run.created_by ?? null,
    createdByName: run.createdByName ?? run.created_by_name ?? run.creator_name ?? null,
    questionCount: run.questionCount ?? meta?.questionCount,
    distanceBetweenQuestions: run.distanceBetweenQuestions ?? meta?.distanceBetweenQuestions,
    minutesBetweenQuestions: run.minutesBetweenQuestions ?? meta?.minutesBetweenQuestions,
    lengthMeters: run.lengthMeters ?? meta?.lengthMeters,
    allowRouteSelection: run.allowRouteSelection ?? meta?.allowRouteSelection,
    startPoint: run.startPoint ?? meta?.startPoint,
    audience: run.audience ?? meta?.audience,
    difficulty: run.difficulty ?? meta?.difficulty,
    language: run.language ?? meta?.language,
    paymentPolicy,
    paymentStatus,
    paymentTotalAmount,
    paymentHostAmount,
    paymentPlayerAmount,
    paymentCurrency,
    paymentProviderId,
    expectedPlayers,
    anonymousPolicy,
    maxAnonymous,
    hostPaymentId,
    allowAnonymous
  };
};

const normalizeAnswer = (answer) => {
  if (!answer) return answer;
  return {
    ...answer,
    questionId: answer.questionId ?? answer.question_id,
    answerIndex: answer.answerIndex ?? answer.answer_index,
    correct: answer.correct ?? answer.is_correct ?? false,
    answeredAt: answer.answeredAt ?? normalizeTimestamp(answer.answered_at)
  };
};

const normalizeParticipantRow = (participant) => {
  if (!participant) return participant;
  return {
    ...participant,
    runId: participant.runId ?? participant.run_id,
    userId: participant.userId ?? participant.user_id,
    joinedAt: participant.joinedAt ?? normalizeTimestamp(participant.joined_at),
    completedAt: participant.completedAt ?? normalizeTimestamp(participant.completed_at),
    lastSeen: participant.lastSeen ?? normalizeTimestamp(participant.last_seen),
    paymentStatus: participant.paymentStatus ?? participant.payment_status ?? null,
    paymentAmount: participant.paymentAmount ?? participant.payment_amount ?? null,
    paymentCurrency: participant.paymentCurrency ?? participant.payment_currency ?? null,
    paymentProviderId: participant.paymentProviderId ?? participant.payment_provider_id ?? null,
    paymentId: participant.paymentId ?? participant.payment_id ?? null,
    isAnonymous: participant.isAnonymous ?? participant.is_anonymous ?? null
  };
};

const normalizeParticipant = (participant, answers = []) => {
  if (!participant) return participant;
  const safeAnswers = Array.isArray(answers)
    ? answers.map(normalizeAnswer)
    : [];
  const currentOrder = Number.isFinite(participant.currentOrder)
    ? participant.currentOrder
    : safeAnswers.length + 1;

  return {
    ...normalizeParticipantRow(participant),
    answers: safeAnswers,
    currentOrder
  };
};

// Helper för API-anrop
const apiCall = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error (${response.status}): ${errorText}`);
  }

  return response.json();
};

export const runRepository = {
  /**
   * Lista alla runs (admin funktion)
   */
  listRuns: async () => {
    try {
      const data = await apiCall('/api/runs');
      return (data.runs || []).map(normalizeRun);
    } catch (error) {
      console.error('[runRepository] Failed to list runs:', error);
      throw error;
    }
  },

  /**
   * Lista rundor från en given ID-lista
   */
  listRunsByIds: async (runIds = []) => {
    try {
      if (!Array.isArray(runIds) || runIds.length === 0) {
        return [];
      }
      const runs = await runRepository.listRuns();
      const lookup = new Set(runIds);
      return runs.filter((run) => lookup.has(run.id));
    } catch (error) {
      console.error('[runRepository] Failed to list runs by ids:', error);
      throw error;
    }
  },

  /**
   * Hämta en specifik run
   */
  getRun: async (runId) => {
    try {
      const data = await apiCall(`/api/runs/${runId}`);
      return normalizeRun(data.run);
    } catch (error) {
      console.error('[runRepository] Failed to get run:', error);
      throw error;
    }
  },

  /**
   * Hämta run via join code
   */
  getRunByCode: async (joinCode) => {
    try {
      const data = await apiCall(`/api/runs/${joinCode}/by-code`);
      return normalizeRun(data.run);
    } catch (error) {
      console.error('[runRepository] Failed to get run by code:', error);
      throw error;
    }
  },

  /**
   * Skapa ny run
   */
  createRun: async (runData, creator) => {
    try {
      const payload = {
        ...runData,
        created_by: creator.id
      };
      if (runData?.expectedPlayers && !payload.expected_players) {
        payload.expected_players = runData.expectedPlayers;
      }
      if (runData?.paymentId && !payload.payment_id) {
        payload.payment_id = runData.paymentId;
      }
      const data = await apiCall('/api/runs', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return normalizeRun(data.run);
    } catch (error) {
      console.error('[runRepository] Failed to create run:', error);
      throw error;
    }
  },

  /**
   * Generera route run (specialfall av createRun)
   */
  generateRouteRun: async (options, creator) => {
    try {
      // Detta är en specialfunktion som kan hantera route-generering
      const runData = {
        name: options.name || 'Route Run',
        question_ids: options.questionIds || [],
        checkpoints: options.checkpoints || [],
        route: options.route || null
      };
      return await runRepository.createRun(runData, creator);
    } catch (error) {
      console.error('[runRepository] Failed to generate route run:', error);
      throw error;
    }
  },

  /**
   * Uppdatera run
   */
  updateRun: async (runId, updates) => {
    try {
      const data = await apiCall(`/api/runs/${runId}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      return normalizeRun(data.run);
    } catch (error) {
      console.error('[runRepository] Failed to update run:', error);
      throw error;
    }
  },

  /**
   * Stäng run
   */
  closeRun: async (runId) => {
    try {
      await apiCall(`/api/runs/${runId}/close`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('[runRepository] Failed to close run:', error);
      throw error;
    }
  },

  /**
   * Ta bort run
   */
  deleteRun: async (runId) => {
    try {
      await apiCall(`/api/runs/${runId}`, {
        method: 'DELETE',
      });
    } catch (error) {
      console.error('[runRepository] Failed to delete run:', error);
      throw error;
    }
  },

  /**
   * Lista deltagare för en run
   */
  listParticipants: async (runId) => {
    try {
      const data = await apiCall(`/api/participants?runId=${encodeURIComponent(runId)}`);
      return (data.participants || []).map(normalizeParticipantRow);
    } catch (error) {
      console.error('[runRepository] Failed to list participants:', error);
      throw error;
    }
  },

  /**
   * Hämta specifik deltagare
   */
  getParticipant: async (runId, participantId) => {
    try {
      const data = await apiCall(`/api/participants/${participantId}`);
      const answersData = await apiCall(`/api/answers?participantId=${encodeURIComponent(participantId)}`);
      return normalizeParticipant(data.participant, answersData.answers);
    } catch (error) {
      console.error('[runRepository] Failed to get participant:', error);
      throw error;
    }
  },

  /**
   * Registrera ny deltagare
   */
  registerParticipant: async (runId, participantData) => {
    try {
      const payload = {
        run_id: runId,
        ...participantData
      };
      if (!payload.user_id && participantData?.userId) {
        payload.user_id = participantData.userId;
      }
      if (!payload.payment_id && participantData?.paymentId) {
        payload.payment_id = participantData.paymentId;
      }
      if (participantData?.isAnonymous !== undefined && payload.is_anonymous === undefined) {
        payload.is_anonymous = participantData.isAnonymous;
      }
      const data = await apiCall('/api/participants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return normalizeParticipant(data.participant, []);
    } catch (error) {
      console.error('[runRepository] Failed to register participant:', error);
      throw error;
    }
  },

  /**
   * Spela in svar från deltagare
   */
  recordAnswer: async (runId, participantId, answerData = {}) => {
    try {
      const { questionId, answerIndex, correct } = answerData;
      const payload = {
        participant_id: participantId,
        question_id: questionId,
        answer_index: answerIndex,
        is_correct: correct
      };
      await apiCall('/api/answers', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      
      // Returnera uppdaterad participant (för compatibility)
      return await runRepository.getParticipant(runId, participantId);
    } catch (error) {
      console.error('[runRepository] Failed to record answer:', error);
      throw error;
    }
  },

  /**
   * Markera run som komplett för deltagare
   */
  completeRun: async (runId, participantId) => {
    try {
      await apiCall(`/api/participants/${participantId}/complete`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('[runRepository] Failed to complete run:', error);
      throw error;
    }
  },

  /**
   * Heartbeat för deltagare
   */
  heartbeatParticipant: async (runId, participantId) => {
    try {
      await apiCall(`/api/participants/${participantId}`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('[runRepository] Failed to heartbeat participant:', error);
      // Don't throw for heartbeat failures - they're non-critical
    }
  },

  /**
   * Prenumerera på runs (real-time via SSE)
   */
  subscribeRuns: (callback) => {
    // För admin-funktionalitet - prenumerera på alla runs
    const eventSource = new EventSource(`${API_BASE_URL}/api/sse?runId=admin`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (Array.isArray(data.runs)) {
        callback(data.runs.map(normalizeRun));
      }
    };

    eventSource.onerror = (error) => {
      console.error('[runRepository] SSE error for runs subscription:', error);
    };

    return () => {
      eventSource.close();
    };
  },

  /**
   * Prenumerera på deltagare för en specifik run
   */
  subscribeParticipants: (runId, callback) => {
    const eventSource = new EventSource(`${API_BASE_URL}/api/sse?runId=${encodeURIComponent(runId)}`);
    
    eventSource.addEventListener('initial-state', (event) => {
      const data = JSON.parse(event.data);
      if (data.participants) {
        callback(data.participants.map(normalizeParticipantRow));
      }
    });

    eventSource.addEventListener('participant-joined', (event) => {
      const data = JSON.parse(event.data);
      if (data.participant) {
        // Fetch updated participant list
        runRepository.listParticipants(runId).then(callback).catch(console.error);
      }
    });

    eventSource.addEventListener('answer-submitted', (event) => {
      // Refresh participants when answers are submitted (for progress tracking)
      runRepository.listParticipants(runId).then(callback).catch(console.error);
    });

    eventSource.onerror = (error) => {
      console.error('[runRepository] SSE error for participants subscription:', error);
    };

    return () => {
      eventSource.close();
    };
  },

  /**
   * Prenumerera på run state (compatibility method)
   */
  subscribeToRuns: (callback) => {
    return runRepository.subscribeRuns(callback);
  }
};

export default runRepository;
