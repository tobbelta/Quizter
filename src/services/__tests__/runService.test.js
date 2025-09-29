import { jest } from '@jest/globals';
import { FALLBACK_POSITION } from '../../utils/constants';

const mockLocalStorage = () => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = value;
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
};

describe('runService', () => {
  let runService;
  let PARTICIPANT_TIMEOUT_MS;

  beforeEach(() => {
    jest.resetModules();
    ({ runService, PARTICIPANT_TIMEOUT_MS } = require('../runService'));
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage(),
      writable: true
    });
  });

  test('createRun skapar run med korrekt antal frågor och join kod', () => {
    const run = runService.createRun({
      name: 'Test Run',
      difficulty: 'family',
      audience: 'family',
      questionCount: 4,
      lengthMeters: 1500,
      allowAnonymous: true
    }, { id: 'admin', name: 'Admin' });

    expect(run.id).toBeTruthy();
    expect(run.joinCode).toHaveLength(6);
    expect(run.questionIds).toHaveLength(4);
    expect(run.checkpoints).toHaveLength(4);

    const stored = runService.listRuns();
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe('Test Run');
  });

  test('generateRouteRun skapar genererad runda med koordinater', async () => {
    const run = await runService.generateRouteRun({
      alias: 'Auto',
      questionCount: 5,
      lengthMeters: 2200,
      audience: 'family',
      difficulty: 'family',
      allowAnonymous: true,
      origin: FALLBACK_POSITION
    });

    expect(run.type).toBe('generated');
    expect(run.checkpoints).toHaveLength(5);
    run.checkpoints.forEach((checkpoint) => {
      expect(typeof checkpoint.location.lat).toBe('number');
      expect(typeof checkpoint.location.lng).toBe('number');
    });
  });

  test('registerParticipant kastar fel om anonyma ej tillåts', () => {
    const run = runService.createRun({
      name: 'Endast registrerade',
      difficulty: 'adult',
      audience: 'adult',
      questionCount: 3,
      allowAnonymous: false
    }, { id: 'admin', name: 'Admin' });

    expect(() => runService.registerParticipant(run.id, {
      alias: 'Anonym',
      isAnonymous: true
    })).toThrow('Anonyma deltagare är inte tillåtna');
  });

  test('subscribeParticipants notifierar prenumeranter vid uppdateringar', () => {
    const run = runService.createRun({
      name: 'Notifieringstest',
      difficulty: 'family',
      audience: 'family',
      questionCount: 3,
      allowAnonymous: true
    }, { id: 'admin', name: 'Admin' });

    const participant = runService.registerParticipant(run.id, {
      alias: 'Prenumerant',
      isAnonymous: true
    });

    const updates = [];
    const unsubscribe = runService.subscribeParticipants(run.id, (snapshot) => {
      updates.push(snapshot);
    });

    expect(updates).toHaveLength(1);

    runService.recordAnswer(run.id, participant.id, {
      questionId: run.questionIds[0],
      answerIndex: 0,
      correct: true
    });

    expect(updates.length).toBeGreaterThan(1);
    const latestParticipant = updates.at(-1).find((entry) => entry.id === participant.id);
    expect(latestParticipant.score).toBe(1);
    unsubscribe();
  });

  test('heartbeatParticipant uppdaterar närvaro och status', () => {
    const run = runService.createRun({
      name: 'Heartbeat',
      difficulty: 'family',
      audience: 'family',
      questionCount: 3,
      allowAnonymous: true
    }, { id: 'admin', name: 'Admin' });

    runService.registerParticipant(run.id, {
      alias: 'Närvaro',
      isAnonymous: true
    });

    const baseParticipant = runService.listParticipants(run.id)[0];
    expect(baseParticipant.status).toBe('active');

    const baseTime = Date.now();
    const staleSpy = jest.spyOn(Date, 'now').mockImplementation(() => baseTime + PARTICIPANT_TIMEOUT_MS + 1000);
    const staleParticipant = runService.listParticipants(run.id)[0];
    expect(staleParticipant.status).toBe('inactive');
    staleSpy.mockRestore();

    runService.heartbeatParticipant(run.id, baseParticipant.id);
    const refreshed = runService.listParticipants(run.id)[0];
    expect(refreshed.status).toBe('active');
  });
});
