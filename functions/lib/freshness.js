const DAY_MS = 24 * 60 * 60 * 1000;

const parseDateValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
};

const clampBestBeforeAt = (bestBeforeAt, freshnessConfig, now = Date.now()) => {
  if (!bestBeforeAt || !freshnessConfig) return bestBeforeAt;
  const minDays = Number(freshnessConfig.minShelfLifeDays) || 0;
  const maxDays = Number(freshnessConfig.maxShelfLifeDays) || 0;
  let resolved = bestBeforeAt;
  if (minDays > 0) {
    const minAt = now + minDays * DAY_MS;
    if (resolved < minAt) resolved = minAt;
  }
  if (maxDays > 0) {
    const maxAt = now + maxDays * DAY_MS;
    if (resolved > maxAt) resolved = maxAt;
  }
  return resolved;
};

export const resolveFreshnessFields = (input = {}, freshnessConfig = null, now = Date.now()) => {
  if (freshnessConfig && freshnessConfig.enabled === false) {
    return {
      timeSensitive: false,
      bestBeforeAt: null,
      bestBeforeDate: null
    };
  }
  const rawTimeSensitive = input.timeSensitive ?? input.time_sensitive;
  let timeSensitive = rawTimeSensitive === true || rawTimeSensitive === 'true' || rawTimeSensitive === 1;
  const ageGroupValue = input.ageGroup || input.age_group;
  const ageGroupsValue = input.ageGroups || input.age_groups;
  const normalizedAgeGroup = ageGroupValue ? String(ageGroupValue).toLowerCase() : null;
  const normalizedAgeGroups = Array.isArray(ageGroupsValue)
    ? ageGroupsValue.map((value) => String(value).toLowerCase())
    : [];
  const bestBeforeDateValue = input.bestBeforeDate ?? input.best_before_date ?? input.bestBefore ?? input.best_before;
  const bestBeforeAtValue = input.bestBeforeAt ?? input.best_before_at;
  let bestBeforeAt = parseDateValue(bestBeforeAtValue) || parseDateValue(bestBeforeDateValue);

  if (!timeSensitive && bestBeforeAt) {
    timeSensitive = true;
  }

  if (!timeSensitive && freshnessConfig?.autoTimeSensitiveAgeGroups?.length) {
    const autoGroups = freshnessConfig.autoTimeSensitiveAgeGroups.map((value) => String(value).toLowerCase());
    const matches = normalizedAgeGroup && autoGroups.includes(normalizedAgeGroup)
      ? true
      : normalizedAgeGroups.some((group) => autoGroups.includes(group));
    if (matches) {
      timeSensitive = true;
    }
  }

  if (timeSensitive && !bestBeforeAt && freshnessConfig?.defaultShelfLifeDays) {
    bestBeforeAt = now + Number(freshnessConfig.defaultShelfLifeDays) * DAY_MS;
  }

  bestBeforeAt = clampBestBeforeAt(bestBeforeAt, freshnessConfig, now);

  return {
    timeSensitive,
    bestBeforeAt,
    bestBeforeDate: bestBeforeAt ? new Date(bestBeforeAt).toISOString().slice(0, 10) : null
  };
};

export const isExpiredByBestBefore = (bestBeforeAt, now = Date.now()) => {
  if (!bestBeforeAt) return false;
  return Number(bestBeforeAt) <= now;
};
