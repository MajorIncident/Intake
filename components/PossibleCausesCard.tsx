export default function PossibleCausesCard({ analysisId }: { analysisId: string }) {
  return (
    <section className="card" data-card="possible-causes">
      <header className="card-header">
        <h3>Possible Causes</h3>
      </header>
      <div className="muted">Placeholder for possible causes for analysis {analysisId}.</div>
    </section>
  );
}
