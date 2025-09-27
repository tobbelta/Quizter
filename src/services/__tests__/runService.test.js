import { runService } from '../runService';

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
  beforeEach(() => {
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

  test('generateRouteRun skapar genererad runda med koordinater', () => {
    const run = runService.generateRouteRun({
      alias: 'Auto',
      questionCount: 5,
      lengthMeters: 2200,
      audience: 'family',
      difficulty: 'family',
      allowAnonymous: true,
      origin: { lat: 56.662, lng: 16.361 }
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
});
