const badgeConfig = {
  high: {
    icon: '🔥',
    className: 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30',
  },
  medium: {
    icon: '⚡',
    className: 'bg-amber-500/20 text-amber-300 ring-amber-400/30',
  },
  low: {
    icon: '❄️',
    className: 'bg-sky-500/20 text-sky-300 ring-sky-400/30',
  },
};

function ScoreBadge({ tier, score }) {
  const config = badgeConfig[tier] || badgeConfig.low;

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${config.className}`}>
      <span>{config.icon}</span>
      <span>{score}</span>
    </span>
  );
}

export default ScoreBadge;
