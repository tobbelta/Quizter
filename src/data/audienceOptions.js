export const DEFAULT_AGE_GROUPS = [
  { id: 'children', label: 'Barn', minAge: 6, maxAge: 12 },
  { id: 'youth', label: 'Ungdom', minAge: 13, maxAge: 17 },
  { id: 'adults', label: 'Vuxen', minAge: 18, maxAge: null }
];

export const DEFAULT_TARGET_AUDIENCES = [
  { id: 'swedish', label: 'Svensk' },
  { id: 'english', label: 'Engelsk' },
  { id: 'international', label: 'Internationell' },
  { id: 'global', label: 'Global' },
  { id: 'german', label: 'Tysk' },
  { id: 'norwegian', label: 'Norsk' },
  { id: 'danish', label: 'Dansk' }
];

export const formatAgeGroupLabel = (group) => {
  if (!group) return '';
  const minCandidate = Number(group.minAge);
  const maxCandidate = Number(group.maxAge);
  const min = Number.isFinite(minCandidate) ? minCandidate : null;
  const max = Number.isFinite(maxCandidate) ? maxCandidate : null;
  const range = (min !== null && max !== null)
    ? `${min}-${max} år`
    : (min !== null ? `${min}+ år` : '');
  return range ? `${group.label} (${range})` : group.label;
};
