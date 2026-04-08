import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const modules = [
  {
    id: 'mvm',
    title: 'Margin Value Analysis',
    subtitle: 'Parametric margin analysis using the MVM',
    description:
      'Build calculation graphs, run sensitivity studies, redesign analysis, and probabilistic assessments using the Margin Value Method.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
        <line x1="10" y1="11" x2="38" y2="11" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
        <line x1="10" y1="11" x2="24" y2="35" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="38" y1="11" x2="24" y2="35" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round"/>
        <polygon points="10,5 16,11 10,17 4,11" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="1"/>
        <circle cx="38" cy="11" r="6" fill="#1D4ED8" stroke="#60A5FA" strokeWidth="1"/>
        <rect x="17.5" y="31" width="13" height="9" rx="3" fill="#059669" stroke="#34D399" strokeWidth="1"/>
      </svg>
    ),
    route: '/mvm',
    ready: true,
  },
  {
    id: 'cascade',
    title: 'Margin Deployment Cascading',
    subtitle: 'QFD-inspired margin allocation across abstraction levels',
    description:
      'Map margin allocation from stakeholder needs through requirements and architecture to design parameters using cascading matrices.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
        <rect x="4" y="5" width="16" height="12" rx="3" fill="#2F5496" stroke="#60A5FA" strokeWidth="1"/>
        <rect x="16" y="17" width="16" height="12" rx="3" fill="#0D7377" stroke="#5EEAD4" strokeWidth="1"/>
        <rect x="28" y="29" width="16" height="12" rx="3" fill="#92400E" stroke="#FCD34D" strokeWidth="1"/>
        <line x1="20" y1="17" x2="24" y2="21" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="32" y1="29" x2="36" y2="33" stroke="#A78BFA" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    ),
    route: '/cascade',
    ready: true,
  },
];

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      <header className="home-header">
        <h1 className="home-title">MARVIN</h1>
        <p className="home-subtitle">
          Margin Analysis Suite &mdash; Select a module to begin
        </p>
      </header>

      <div className="home-modules">
        {modules.map((mod) => (
          <button
            key={mod.id}
            type="button"
            className={`module-card ${mod.ready ? '' : 'module-card--disabled'}`}
            onClick={() => mod.ready && navigate(mod.route)}
            disabled={!mod.ready}
          >
            <div className="module-icon">{mod.icon}</div>
            <h2 className="module-title">{mod.title}</h2>
            <p className="module-subtitle">{mod.subtitle}</p>
            <p className="module-description">{mod.description}</p>
            {!mod.ready && (
              <span className="module-badge">Coming Soon</span>
            )}
          </button>
        ))}
      </div>

      <footer className="home-footer">
        &copy; {new Date().getFullYear()} Arindam Brahma &middot; Based on the
        Margin Value Method &middot;{' '}
        <a
          href="https://link.springer.com/article/10.1007/s00163-020-00335-8"
          target="_blank"
          rel="noreferrer"
        >
          Res. Eng. Design (2021)
        </a>
      </footer>
    </div>
  );
}
