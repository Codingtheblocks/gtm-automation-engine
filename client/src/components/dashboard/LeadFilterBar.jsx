function LeadFilterBar({ filters, options, onChange }) {
  const handleChange = (event) => {
    const { name, value } = event.target;
    onChange(name, value);
  };

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Variant</span>
        <select name="variant" value={filters.variant} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500">
          <option value="all">All variants</option>
          {options.variants.map((variant) => <option key={variant} value={variant}>{variant}</option>)}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">City</span>
        <select name="city" value={filters.city} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500">
          <option value="all">All cities</option>
          {options.cities.map((city) => <option key={city} value={city}>{city}</option>)}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Enrichment level</span>
        <select name="enrichmentLevel" value={filters.enrichmentLevel} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500">
          <option value="all">All enrichment levels</option>
          {options.enrichmentLevels.map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
      </label>

      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Min score</span>
        <input name="minScore" type="number" min="0" max="100" value={filters.minScore} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500" />
      </label>

      <label className="space-y-2">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Max score</span>
        <input name="maxScore" type="number" min="0" max="100" value={filters.maxScore} onChange={handleChange} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-brand-500" />
      </label>
    </div>
  );
}

export default LeadFilterBar;
