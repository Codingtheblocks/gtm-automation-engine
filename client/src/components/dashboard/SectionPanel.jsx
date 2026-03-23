function SectionPanel({ title, eyebrow, description, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-slate-800 bg-slate-900/70 p-5 ${className}`.trim()}>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow ? <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p> : null}
          <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
          {description ? <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export default SectionPanel;
