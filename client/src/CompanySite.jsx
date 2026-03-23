function CompanySite() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/70 p-10 shadow-2xl">
        <span className="inline-flex rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-brand-100">
          Local Destination Page
        </span>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-white">Company Site</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
          This is the local destination page used for CTA tracking inside the Repair Shops demo. Until you replace it with a real landing page, tracked email links can safely redirect here so clicks are measurable inside the project.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Trackable CTA Target</p>
            <p className="mt-2 text-sm text-slate-400">
              Email CTA links can redirect here through the backend click tracker.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Safe Local Default</p>
            <p className="mt-2 text-sm text-slate-400">
              Useful while you iterate on prompts, templates, and campaign analytics.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Ready To Replace</p>
            <p className="mt-2 text-sm text-slate-400">
              Swap the Company URL in prompt settings whenever you have a real landing page.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-6">
          <p className="text-sm uppercase tracking-wide text-slate-500">Default route</p>
          <p className="mt-2 break-all text-lg font-medium text-brand-100">/company-site</p>
        </div>
      </div>
    </div>
  );
}

export default CompanySite;
