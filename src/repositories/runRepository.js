// Stub: Legacy Firestore run repository is now disabled. All logic moved to Cloudflare API endpoints.
export const runRepository = {
  listRuns: async () => [],
  getRun: async () => null,
  createRun: async () => { throw new Error('Legacy runRepository disabled'); },
  updateRun: async () => { throw new Error('Legacy runRepository disabled'); },
  deleteRun: async () => { throw new Error('Legacy runRepository disabled'); },
  subscribeToRuns: () => () => {},
};
export default runRepository;
