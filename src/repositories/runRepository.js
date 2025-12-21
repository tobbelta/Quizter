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

const normalizeRun = (run) => {
  if (!run) return run;
  const questionIds = run.questionIds || run.question_ids || [];
  const joinCode = run.joinCode || run.join_code || null;
  const createdAt = run.createdAt ?? normalizeTimestamp(run.created_at);
  const updatedAt = run.updatedAt ?? normalizeTimestamp(run.updated_at);

  return {
    ...run,
    joinCode,
    questionIds,
    createdAt,
    updatedAt
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
      return data.participants || [];
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
      return data.participant;
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
      const data = await apiCall('/api/participants', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return data.participant;
    } catch (error) {
      console.error('[runRepository] Failed to register participant:', error);
      throw error;
    }
  },

  /**
   * Spela in svar från deltagare
   */
  recordAnswer: async (runId, participantId, questionId, answerIndex, isCorrect) => {
    try {
      const payload = {
        participant_id: participantId,
        question_id: questionId,
        answer_index: answerIndex
        // is_correct beräknas automatiskt på backend
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
      await apiCall(`/api/participants/${participantId}/heartbeat`, {
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
      if (data.runs) {
        callback(data.runs);
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
        callback(data.participants);
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
