function ScatterPlot({ title, subtitle, points = [] }) {
  const width = 420;
  const height = 250;
  const padding = 28;
  const maxScore = Math.max(100, ...points.map((point) => Number(point.score || 0)));
  const maxCost = Math.max(1, ...points.map((point) => Number(point.cost || 0)));

  const getX = (score) => padding + (Number(score || 0) / maxScore) * (width - padding * 2);
  const getY = (cost) => height - padding - (Number(cost || 0) / maxCost) * (height - padding * 2);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[250px] w-full min-w-[420px]">
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" strokeWidth="1" />
          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#334155" strokeWidth="1" />
          {points.map((point) => (
            <circle
              key={point.id}
              cx={getX(point.score)}
              cy={getY(point.cost)}
              r="5"
              fill={point.variant === 'B' ? '#22c55e' : '#38bdf8'}
            >
              <title>{`${point.label}: score ${point.score}, cost ${point.cost}`}</title>
            </circle>
          ))}
          <text x={width / 2} y={height - 6} textAnchor="middle" fill="#94a3b8" fontSize="11">Lead Score</text>
          <text x={14} y={height / 2} textAnchor="middle" fill="#94a3b8" fontSize="11" transform={`rotate(-90 14 ${height / 2})`}>Cost</text>
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-sky-400" />Variant A</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Variant B</span>
      </div>
    </div>
  );
}

export default ScatterPlot;
