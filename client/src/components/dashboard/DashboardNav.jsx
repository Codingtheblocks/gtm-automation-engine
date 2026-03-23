const pageLabels = {
  overview: 'Campaign Overview',
  leads: 'Leads',
  system: 'System Performance',
};

function DashboardNav({ activePage, onChange }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {Object.entries(pageLabels).map(([pageKey, label]) => (
        <button
          key={pageKey}
          type="button"
          onClick={() => onChange(pageKey)}
          className={`rounded-xl px-4 py-2 text-sm font-medium transition ${activePage === pageKey ? 'bg-brand-600 text-white' : 'border border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-500 hover:text-white'}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

export default DashboardNav;
