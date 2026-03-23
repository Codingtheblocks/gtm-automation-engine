function MetricBarChart({ title, subtitle, data = [], colorClassName = 'bg-brand-500', valueFormatter = (value) => Number(value || 0).toFixed(1) }) {
  const maxValue = Math.max(1, ...data.map((item) => Number(item.value || 0)));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      <div className="mt-4 space-y-4">
        {data.map((item) => (
          <div key={item.label} className="space-y-2">
            <div className="flex items-center justify-between text-sm text-slate-300">
              <span>{item.label}</span>
              <span>{valueFormatter(item.value)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${colorClassName}`}
                style={{ width: `${Math.max(8, (Number(item.value || 0) / maxValue) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MetricBarChart;
