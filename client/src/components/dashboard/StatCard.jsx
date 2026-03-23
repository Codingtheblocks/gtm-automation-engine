function StatCard({ label, value, helper, accent = 'brand' }) {
  const accentClassName = accent === 'emerald'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
    : accent === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
      : 'border-brand-500/30 bg-brand-500/10 text-brand-100';

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <div className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ${accentClassName}`}>
        {label}
      </div>
      <div className="mt-4 text-3xl font-semibold text-white">{value}</div>
      {helper ? <p className="mt-2 text-sm text-slate-400">{helper}</p> : null}
    </div>
  );
}

export default StatCard;
