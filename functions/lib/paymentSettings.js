import { decryptSecret, encryptSecret } from './crypto.js';
import { ensureDatabase } from './ensureDatabase.js';

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Kort' },
  { id: 'bank', label: 'Banköverföring' },
  { id: 'invoice', label: 'Faktura' },
  { id: 'installment', label: 'Delbetalning' },
  { id: 'mobile', label: 'Mobilbetalning' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'crypto', label: 'Krypto' },
];

export const PAYMENT_PROVIDER_CATALOG = [
  { id: 'stripe', label: 'Stripe', type: 'stripe', methods: ['card', 'wallet'] },
  { id: 'paypal', label: 'PayPal', type: 'external', methods: ['wallet', 'card', 'bank'] },
  { id: 'klarna', label: 'Klarna', type: 'external', methods: ['invoice', 'installment'] },
  { id: 'swish', label: 'Swish', type: 'external', methods: ['mobile'] },
  { id: 'vipps', label: 'Vipps', type: 'external', methods: ['mobile'] },
  { id: 'mobilepay', label: 'MobilePay', type: 'external', methods: ['mobile'] },
  { id: 'adyen', label: 'Adyen', type: 'external', methods: ['card', 'bank', 'wallet'] },
  { id: 'checkout', label: 'Checkout.com', type: 'external', methods: ['card', 'wallet'] },
  { id: 'square', label: 'Square', type: 'external', methods: ['card', 'wallet'] },
  { id: 'mollie', label: 'Mollie', type: 'external', methods: ['card', 'bank', 'wallet'] },
  { id: 'paystack', label: 'Paystack', type: 'external', methods: ['card', 'bank', 'wallet'] },
  { id: 'razorpay', label: 'Razorpay', type: 'external', methods: ['card', 'bank', 'wallet'] },
  { id: 'revolut', label: 'Revolut Pay', type: 'external', methods: ['wallet'] },
  { id: 'worldpay', label: 'Worldpay', type: 'external', methods: ['card'] },
  { id: 'braintree', label: 'Braintree', type: 'external', methods: ['card', 'wallet'] },
  { id: 'applepay', label: 'Apple Pay', type: 'external', methods: ['wallet'] },
  { id: 'googlepay', label: 'Google Pay', type: 'external', methods: ['wallet'] },
];

const DEFAULT_DONATION_AMOUNTS = [1000, 2000, 5000];

const normalizeProviderId = (value) => {
  if (!value) return null;
  return String(value).trim().toLowerCase();
};

const buildDefaultProviders = () => PAYMENT_PROVIDER_CATALOG.map((provider) => ({
  id: provider.id,
  label: provider.label,
  type: provider.type,
  methods: provider.methods,
  isEnabled: provider.id === 'stripe',
  publicKey: '',
  encryptedSecret: null,
  secretHint: '',
  checkoutUrlTemplate: '',
  isCustom: false,
}));

const DEFAULT_SETTINGS = {
  activeProviderId: 'stripe',
  payer: 'host',
  currency: 'sek',
  enabledMethods: ['card'],
  perRun: {
    enabled: true,
    baseAmount: 0,
    playerTiers: [],
    questionTiers: [],
  },
  subscription: {
    enabled: false,
    period: 'month',
    amount: 9900,
  },
  anonymous: {
    policy: 'allow',
    maxPerRun: 0,
  },
  donations: {
    enabled: true,
    allowCustom: true,
    amounts: DEFAULT_DONATION_AMOUNTS,
    placements: {
      landing: true,
      createRun: false,
      afterRun: true,
      menu: true,
    },
  },
  providers: buildDefaultProviders(),
};

const mergeProvider = (base, stored) => {
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    id: base.id,
    label: stored.label || base.label,
    type: stored.type || base.type,
    methods: Array.isArray(stored.methods) && stored.methods.length > 0 ? stored.methods : base.methods,
    isEnabled: stored.isEnabled !== undefined ? Boolean(stored.isEnabled) : base.isEnabled,
    publicKey: stored.publicKey || base.publicKey || '',
    encryptedSecret: stored.encryptedSecret || base.encryptedSecret || null,
    secretHint: stored.secretHint || base.secretHint || '',
    checkoutUrlTemplate: stored.checkoutUrlTemplate || base.checkoutUrlTemplate || '',
    isCustom: stored.isCustom || base.isCustom || false,
  };
};

const buildProviders = (storedProviders = []) => {
  const defaults = buildDefaultProviders();
  const storedMap = new Map();
  if (Array.isArray(storedProviders)) {
    storedProviders.forEach((provider) => {
      const id = normalizeProviderId(provider?.id);
      if (!id) return;
      storedMap.set(id, provider);
    });
  }

  const merged = defaults.map((provider) => {
    const stored = storedMap.get(provider.id) || null;
    return mergeProvider(provider, stored);
  });

  const custom = Array.isArray(storedProviders)
    ? storedProviders.filter((provider) => {
        const id = normalizeProviderId(provider?.id);
        if (!id) return false;
        return !PAYMENT_PROVIDER_CATALOG.find((entry) => entry.id === id);
      })
    : [];

  custom.forEach((provider) => {
    const id = normalizeProviderId(provider?.id);
    if (!id) return;
    merged.push({
      id,
      label: provider.label || id,
      type: provider.type || 'external',
      methods: Array.isArray(provider.methods) && provider.methods.length > 0 ? provider.methods : ['card'],
      isEnabled: provider.isEnabled !== undefined ? Boolean(provider.isEnabled) : true,
      publicKey: provider.publicKey || '',
      encryptedSecret: provider.encryptedSecret || null,
      secretHint: provider.secretHint || '',
      secretKey: provider.secretKey || '',
      clearSecret: provider.clearSecret || false,
      checkoutUrlTemplate: provider.checkoutUrlTemplate || '',
      isCustom: true,
    });
  });

  return merged;
};

const normalizeSettings = (stored = {}) => {
  const providers = buildProviders(stored.providers || []);
  return {
    activeProviderId: normalizeProviderId(stored.activeProviderId) || DEFAULT_SETTINGS.activeProviderId,
    payer: stored.payer || DEFAULT_SETTINGS.payer,
    currency: stored.currency || DEFAULT_SETTINGS.currency,
    enabledMethods: Array.isArray(stored.enabledMethods) && stored.enabledMethods.length > 0
      ? stored.enabledMethods
      : DEFAULT_SETTINGS.enabledMethods,
    perRun: {
      ...DEFAULT_SETTINGS.perRun,
      ...(stored.perRun || {}),
      playerTiers: Array.isArray(stored?.perRun?.playerTiers) ? stored.perRun.playerTiers : [],
      questionTiers: Array.isArray(stored?.perRun?.questionTiers) ? stored.perRun.questionTiers : [],
    },
    subscription: {
      ...DEFAULT_SETTINGS.subscription,
      ...(stored.subscription || {}),
    },
    anonymous: {
      ...DEFAULT_SETTINGS.anonymous,
      ...(stored.anonymous || {}),
    },
    donations: {
      ...DEFAULT_SETTINGS.donations,
      ...(stored.donations || {}),
      amounts: Array.isArray(stored?.donations?.amounts) && stored.donations.amounts.length > 0
        ? stored.donations.amounts
        : DEFAULT_SETTINGS.donations.amounts,
      placements: {
        ...DEFAULT_SETTINGS.donations.placements,
        ...(stored?.donations?.placements || {}),
      },
    },
    providers,
  };
};

const buildAdminSettings = (settings) => {
  const providers = settings.providers.map((provider) => ({
    ...provider,
    hasSecret: Boolean(provider.encryptedSecret),
    encryptedSecret: undefined,
  }));

  return {
    ...settings,
    providers,
  };
};

const buildPublicConfig = (settings) => {
  const providers = settings.providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    type: provider.type,
    methods: provider.methods,
    isEnabled: provider.isEnabled,
    hasSecret: Boolean(provider.encryptedSecret),
    publicKey: provider.publicKey || null,
    checkoutUrlTemplate: provider.checkoutUrlTemplate || '',
    isCustom: provider.isCustom,
  }));

  const activeProvider = providers.find((provider) => provider.id === settings.activeProviderId) || null;
  const activeProviderReady = Boolean(activeProvider && activeProvider.hasSecret && activeProvider.isEnabled);

  return {
    activeProviderId: activeProviderReady ? settings.activeProviderId : null,
    activeProvider,
    payer: settings.payer,
    currency: settings.currency,
    enabledMethods: settings.enabledMethods,
    perRun: settings.perRun,
    subscription: settings.subscription,
    anonymous: settings.anonymous,
    donations: settings.donations,
    providers,
    paymentsEnabled: activeProviderReady,
  };
};

const readStoredSettings = async (db) => {
  const row = await db.prepare('SELECT config FROM payment_settings WHERE id = ?').bind('default').first();
  if (!row || !row.config) return null;
  try {
    return JSON.parse(row.config);
  } catch (error) {
    console.warn('[paymentSettings] Kunde inte tolka lagrad config:', error.message);
    return null;
  }
};

export const getPaymentSettingsSnapshot = async (env, { includeSecrets = false } = {}) => {
  await ensureDatabase(env.DB);
  const stored = await readStoredSettings(env.DB);
  const settings = normalizeSettings(stored || {});

  if (includeSecrets) {
    const providersWithSecrets = await Promise.all(settings.providers.map(async (provider) => {
      if (!provider.encryptedSecret) return { ...provider, secretKey: null };
      try {
        const decrypted = await decryptSecret(env, provider.encryptedSecret);
        return { ...provider, secretKey: decrypted || null };
      } catch (error) {
        console.warn(`[paymentSettings] Kunde inte dekryptera ${provider.id}:`, error.message);
        return { ...provider, secretKey: null };
      }
    }));
    settings.providers = providersWithSecrets;
  }

  return {
    settings,
    adminSettings: buildAdminSettings(settings),
    publicConfig: buildPublicConfig(settings),
  };
};

export const savePaymentSettings = async (env, nextSettings = {}) => {
  await ensureDatabase(env.DB);
  const current = await getPaymentSettingsSnapshot(env, { includeSecrets: true });
  const normalized = normalizeSettings(nextSettings || {});

  const mergedProviders = normalized.providers.map((provider) => {
    const existing = current.settings.providers.find((entry) => entry.id === provider.id);
    const baseProvider = { ...provider };
    delete baseProvider.hasSecret;
    let encryptedSecret = existing?.encryptedSecret || null;
    let secretHint = existing?.secretHint || '';

    if (provider.clearSecret) {
      encryptedSecret = null;
      secretHint = '';
    }

    if (provider.secretKey && String(provider.secretKey).trim()) {
      const raw = String(provider.secretKey).trim();
      encryptedSecret = null;
      secretHint = `••••${raw.slice(-4)}`;
      provider.secretKey = raw;
    }

    return {
      ...baseProvider,
      encryptedSecret,
      secretHint,
    };
  });

  const providersWithEncryption = [];
  for (const provider of mergedProviders) {
    if (provider.secretKey && String(provider.secretKey).trim()) {
      provider.encryptedSecret = await encryptSecret(env, provider.secretKey);
    }
    delete provider.secretKey;
    delete provider.clearSecret;
    providersWithEncryption.push(provider);
  }

  const activeProviderId = normalizeProviderId(normalized.activeProviderId);
  const activeProvider = providersWithEncryption.find((provider) => provider.id === activeProviderId);
  if (activeProviderId) {
    if (!activeProvider) {
      throw new Error('Aktiv provider saknas i listan.');
    }
    if (!activeProvider.encryptedSecret) {
      throw new Error('Aktiv provider måste ha en hemlig nyckel.');
    }
    if (activeProvider.type === 'stripe' && !activeProvider.publicKey) {
      throw new Error('Stripe kräver public key för att aktiveras.');
    }
  }

  const payload = {
    ...normalized,
    activeProviderId,
    providers: providersWithEncryption,
  };

  await env.DB.prepare(
    'INSERT INTO payment_settings (id, config, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET config = ?, updated_at = ?'
  ).bind(
    'default',
    JSON.stringify(payload),
    Date.now(),
    JSON.stringify(payload),
    Date.now()
  ).run();

  return payload;
};

export const getPaymentCatalog = () => ({
  providers: PAYMENT_PROVIDER_CATALOG,
  methods: PAYMENT_METHODS,
});
