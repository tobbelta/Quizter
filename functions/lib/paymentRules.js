const normalizeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const normalizeTier = (tier) => {
  if (!tier || typeof tier !== 'object') return null;
  const min = normalizeInt(tier.min, 0);
  const max = tier.max === null || tier.max === undefined || tier.max === ''
    ? null
    : normalizeInt(tier.max, 0);
  const amount = normalizeInt(tier.amount, 0);
  if (amount <= 0) return null;
  return { min, max, amount };
};

const matchesTier = (value, tier) => {
  if (!tier) return false;
  if (value < tier.min) return false;
  if (tier.max === null) return true;
  return value <= tier.max;
};

export const resolveHighestTierAmount = (value, tiers = []) => {
  if (!Array.isArray(tiers)) return 0;
  const normalized = tiers.map(normalizeTier).filter(Boolean);
  const matched = normalized.filter((tier) => matchesTier(value, tier));
  if (matched.length === 0) return 0;
  return Math.max(...matched.map((tier) => tier.amount));
};

export const buildRunPaymentQuote = (settings, { questionCount, expectedPlayers, hostHasSubscription } = {}) => {
  const payer = settings?.payer || 'host';
  const currency = settings?.currency || 'sek';
  const perRunEnabled = settings?.perRun?.enabled !== false;
  const baseAmount = normalizeInt(settings?.perRun?.baseAmount, 0);
  const players = normalizeInt(expectedPlayers, 1) || 1;
  const questions = normalizeInt(questionCount, 0);

  let totalAmount = 0;
  if (perRunEnabled) {
    const playerAmount = resolveHighestTierAmount(players, settings?.perRun?.playerTiers || []);
    const questionAmount = resolveHighestTierAmount(questions, settings?.perRun?.questionTiers || []);
    totalAmount = Math.max(baseAmount, playerAmount, questionAmount);
  }

  let hostAmount = totalAmount;
  let playerAmount = 0;

  if (payer === 'player') {
    hostAmount = 0;
    playerAmount = Math.ceil(totalAmount / Math.max(1, players));
  } else if (payer === 'split') {
    hostAmount = Math.ceil(totalAmount / 2);
    const remaining = Math.max(0, totalAmount - hostAmount);
    playerAmount = Math.ceil(remaining / Math.max(1, players));
  }

  if (hostHasSubscription && settings?.subscription?.enabled) {
    hostAmount = 0;
    if (payer === 'host') {
      totalAmount = 0;
    }
  }

  return {
    currency,
    payer,
    totalAmount,
    hostAmount,
    playerAmount,
    expectedPlayers: players,
    questionCount: questions,
  };
};

export const normalizePaymentStatus = (value) => {
  if (!value) return 'pending';
  return String(value).trim().toLowerCase();
};
