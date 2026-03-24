function SearchForm({ form, loading, onChange, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_0.9fr_0.9fr_0.9fr_auto]">
      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-200">City</span>
        <input
          name="city"
          value={form.city}
          onChange={onChange}
          placeholder="Miami, FL"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-brand-500"
          required
        />
      </label>

      <label className="space-y-2">
        <span className="text-sm font-medium text-slate-200">Business type</span>
        <input
          name="keyword"
          value={form.keyword}
          onChange={onChange}
          placeholder="car repair"
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-0 transition focus:border-brand-500"
        />
      </label>

      <label className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-200">Min rating</span>
          <span className="text-xs text-slate-400">{Number(form.minimumRating ?? 0).toFixed(1)}</span>
        </div>
        <input
          name="minimumRating"
          type="range"
          min="1"
          max="5"
          step="0.1"
          value={form.minimumRating ?? 1}
          onChange={onChange}
          className="w-full accent-brand-500"
        />
      </label>

      <label className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-200">Min reviews</span>
          <span className="text-xs text-slate-400">{form.minRating ?? 0}</span>
        </div>
        <input
          name="minRating"
          type="range"
          min="0"
          max="200"
          step="5"
          value={form.minRating ?? 0}
          onChange={onChange}
          className="w-full accent-brand-500"
        />
      </label>

      <label className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium text-slate-200">Max distance</span>
          <span className="text-xs text-slate-400">{form.maxDistance ?? 50} mi</span>
        </div>
        <input
          name="maxDistance"
          type="range"
          min="1"
          max="50"
          step="1"
          value={form.maxDistance ?? 50}
          onChange={onChange}
          className="w-full accent-brand-500"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-7 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? 'Finding Leads...' : 'Search Leads'}
      </button>
    </form>
  );
}

export default SearchForm;
