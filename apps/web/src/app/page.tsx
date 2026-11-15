const projects = [
  { name: "m1cro.ai", path: "~/code/m1cro.ai", branch: "main", activity: "Runtime and workspace foundation", color: "violet", initials: "M" },
  { name: "WheresMaldives", path: "~/code/wheresmaldives", branch: "feat/content-platform", activity: "Travel media platform", color: "cyan", initials: "W" },
  { name: "product-engineering", path: "~/code/product-engineering", branch: "main", activity: "Skills and engineering workflows", color: "amber", initials: "P" },
];

const sessions = [
  { title: "Implement capability-aware routing", project: "m1cro.ai", time: "Today · 10:42", state: "Completed", tone: "green" },
  { title: "Review the content migration", project: "WheresMaldives", time: "Yesterday · 16:18", state: "Paused", tone: "muted" },
  { title: "Refine the product engineering skill", project: "product-engineering", time: "Nov 13 · 11:06", state: "Completed", tone: "green" },
];

function Mark() { return <span className="brand-mark">m<span>·</span></span>; }
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z",
    folder: "M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    clock: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    cpu: "M8 8h8v8H8z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M1 9h3 M1 15h3 M20 9h3 M20 15h3",
    settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 1.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5v.2h-2.6v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-1.8-1.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H6v-2.6h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 1.8-1.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V5h2.6v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 1.8 1.8-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.2v2.6h-.2a1.7 1.7 0 0 0-1.5 1Z",
    plus: "M12 5v14 M5 12h14",
    arrow: "M5 12h14 M13 6l6 6-6 6",
    search: "m20 20-4.5-4.5 M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name] ?? paths.grid} /></svg>;
}

export default function Home() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#"><Mark /><span>m1cro<span className="brand-dot">.ai</span></span></a>
        <div className="workspace-switch"><div className="workspace-avatar">A</div><div><strong>Personal workspace</strong><small>Free plan</small></div><span className="chevron">⌄</span></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav-list">
          <a className="nav-item active" href="#"><Icon name="grid"/>Overview</a>
          <a className="nav-item" href="#"><Icon name="folder"/>Projects<span className="nav-count">3</span></a>
          <a className="nav-item" href="#"><Icon name="clock"/>Sessions</a>
        </nav>
        <div className="nav-label nav-label-spaced">CONFIGURE</div>
        <nav className="nav-list">
          <a className="nav-item" href="#"><Icon name="cpu"/>Models & providers</a>
          <a className="nav-item" href="#"><Icon name="settings"/>Settings</a>
        </nav>
        <div className="sidebar-bottom"><div className="runtime-card"><div className="runtime-indicator"><span/> Runtime offline</div><p>Connect a local or remote runtime to start building.</p><button className="connect-button" type="button">Connect runtime <Icon name="arrow"/></button></div><div className="user-row"><div className="user-avatar">AA</div><div><strong>Developer</strong><small>Local workspace</small></div><span className="more">···</span></div></div>
      </aside>

      <section className="main-panel">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> Overview</div><div className="top-actions"><button className="icon-button" aria-label="Search"><Icon name="search"/></button><span className="top-divider"/><div className="user-avatar small">AA</div></div></header>
        <div className="content-wrap">
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> YOUR ENGINEERING WORKSPACE</div><h1>Build something <span>remarkable.</span></h1><p className="welcome-copy">Your projects, agents and models — together in one place.</p></div><button className="primary-button" type="button"><Icon name="plus"/> New project</button></section>

          <section className="metrics-grid" aria-label="Workspace summary">
            <div className="metric-card"><div className="metric-label">Projects <span className="metric-icon purple"><Icon name="folder"/></span></div><div className="metric-value">03</div><div className="metric-foot">Across your workspace</div></div>
            <div className="metric-card"><div className="metric-label">Sessions <span className="metric-icon blue"><Icon name="clock"/></span></div><div className="metric-value">12</div><div className="metric-foot">Agent conversations</div></div>
            <div className="metric-card"><div className="metric-label">Connected models <span className="metric-icon green"><Icon name="cpu"/></span></div><div className="metric-value">—</div><div className="metric-foot">Connect a provider to begin</div></div>
          </section>

          <section className="section-block"><div className="section-heading"><div><h2>Your projects</h2><p>Pick up where you left off.</p></div><a href="#" className="text-link">View all <Icon name="arrow"/></a></div>
            <div className="project-grid">{projects.map((project) => <article className="project-card" key={project.name}><div className="project-top"><div className={"project-icon " + project.color}>{project.initials}</div><button className="more project-more" aria-label={"More options for " + project.name}>···</button></div><h3>{project.name}</h3><p className="project-path">{project.path}</p><div className="project-activity">{project.activity}</div><div className="project-footer"><span className="branch-pill"><span className="branch-symbol">⑂</span>{project.branch}</span><span className="project-open">Open <Icon name="arrow"/></span></div></article>)}</div>
          </section>

          <section className="section-block recent-block"><div className="section-heading"><div><h2>Recent sessions</h2><p>Continue an agent conversation.</p></div><a href="#" className="text-link">All sessions <Icon name="arrow"/></a></div>
            <div className="session-list">{sessions.map((session) => <article className="session-row" key={session.title}><div className="session-symbol"><span>✳</span></div><div className="session-main"><strong>{session.title}</strong><small>{session.project} <span>·</span> {session.time}</small></div><span className={"session-state " + session.tone}><i/>{session.state}</span><button className="session-arrow" aria-label={"Open " + session.title}><Icon name="arrow"/></button></article>)}</div>
          </section>
          <footer className="page-footer"><span>m1cro.ai <span className="footer-separator">·</span> The AI Engineering Workspace</span><span>Model freedom. Your workflow.</span></footer>
        </div>
      </section>
    </main>
  );
}
