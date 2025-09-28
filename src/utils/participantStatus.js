/**
 * Mapper deltagarnas status till etiketter och Tailwind-klasser.
 */
const STATUS_META = {
  active: {
    label: 'Aktiv',
    dotClass: 'bg-emerald-400',
    pillClass: 'text-emerald-200 border border-emerald-500/40 bg-emerald-500/10'
  },
  inactive: {
    label: 'Frånkopplad',
    dotClass: 'bg-amber-400',
    pillClass: 'text-amber-200 border border-amber-500/40 bg-amber-500/10'
  },
  finished: {
    label: 'Klar',
    dotClass: 'bg-slate-400',
    pillClass: 'text-slate-200 border border-slate-500/40 bg-slate-500/10'
  }
};

/**
 * Returnerar metadata för visuell status eller gul fallback om okänd.
 */
export const describeParticipantStatus = (status) => STATUS_META[status] || STATUS_META.inactive;
