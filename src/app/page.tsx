const modules = [
  ["Conversation", "Text check-ins and one manageable social step."],
  ["Memory", "Proposals become lasting memories only after user approval."],
  ["Agency", "People choose their actions and control their saved information."],
];

export default function Home() {
  return (
    <main className="foundation">
      <p className="eyebrow">Dartmouth AI Hackathon / Development foundation</p>
      <h1>A starting point for the team.</h1>
      <p className="intro">
        The framework is ready for feature development. This preparation page does
        not collect conversations or call an AI service.
      </p>
      <div className="modules">
        {modules.map(([title, description]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{description}</p>
          </section>
        ))}
      </div>
      <div className="next-step">
        <h2>Start with the shared plan</h2>
        <p>
          Read README.md, docs/architecture.md, and docs/api-contracts.md before
          choosing a feature. The database migration is a local draft.
        </p>
        <a href="/api/health">Check application health</a>
      </div>
    </main>
  );
}
