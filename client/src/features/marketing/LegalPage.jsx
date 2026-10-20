import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import './site.css';
import { SiteFooter, SiteNav, useSiteMotion } from './components';

/**
 * Shared layout for the legal pages: title, dates, a contents list that stays in view on wide screens,
 * and the text in a readable column.
 */
export function LegalPage({ title, tabTitle, lead, updated, effective, sections, other }) {
  const ref = useSiteMotion();
  useEffect(() => { document.title = `${tabTitle ?? title} · E-Prescription by ODYSSEY`; }, [tabTitle, title]);

  return (
    <div className="ody" ref={ref}>
      <SiteNav />
      <main className="legal wrap">
        <header className="legal__head">
          <h1>{title}</h1>
          <p className="legal__lead">{lead}</p>
          <p className="legal__dates">
            Effective {effective} · Last updated {updated}
          </p>
        </header>

        <div className="legal__grid">
          <nav className="legal__toc" aria-label="On this page">
            <h2>On this page</h2>
            <ol>
              {sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
              ))}
            </ol>
            {other && <p className="legal__other"><Link to={other.to} className="link">{other.label}</Link></p>}
          </nav>

          <article className="legal__body">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
                <h2 id={`${s.id}-h`}><span className="legal__num" aria-hidden="true">{i + 1}.</span>{s.title}</h2>
                {s.body}
              </section>
            ))}
          </article>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
