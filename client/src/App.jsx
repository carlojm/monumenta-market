import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import MarketMap from './components/MarketMap';
import SearchBar from './components/SearchBar';
import PlotTable from './components/PlotTable';
import PlotDetail from './components/PlotDetail';
import { getSearchResults } from './lib/search';
import { DESKTOP_QUERY, useMediaQuery } from './lib/useMediaQuery';

function App() {
  const [plots, setPlots] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  // The open card comes from the URL (/plot/:plotId), so it can be shared
  // and the back button closes it.
  const { plotId } = useParams();
  const navigate = useNavigate();
  const selectedPlot = plots.find((p) => p.id === plotId) ?? null;

  // Cards opened from inside the app are tagged with `fromApp`, so closing can
  // step back (Back won't reopen the card). A card opened from a direct link
  // has no tag, so closing goes to "/" instead of leaving the site.
  // Switching from one open card to another replaces the history entry, so
  // Back always closes the card instead of stepping through cards.
  const location = useLocation();
  const fromApp = !!location.state?.fromApp;
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const listScroll = useRef(0);
  const openPlot = (plot) => {
    if (!plotId) listScroll.current = window.scrollY;
    navigate(`/plot/${plot.id}`, { replace: !!plotId, state: { fromApp: plotId ? fromApp : true } });
  };
  const closePlot = () => (fromApp ? navigate(-1) : navigate('/', { replace: true }));

  // Desktop: the card replaces the list, so start the card at the top and
  // put the list back where it was on "Back".
  useLayoutEffect(() => {
    if (!isDesktop) return;
    window.scrollTo(0, plotId ? 0 : listScroll.current);
  }, [plotId, isDesktop]);

  const loadPlots = () =>
    fetch('/api/plots')
      .then((res) => res.json())
      .then(setPlots)
      .catch((err) => setError(err.message));

  useEffect(() => {
    loadPlots();
  }, []);

  const searchResults = useMemo(() => getSearchResults(plots, query), [plots, query]);

  return (
    <div>
      <nav className="navbar">
        <span className="navbar__logo">Market Directory</span>
        <button className="navbar__menu-button" aria-label="Menu">☰</button>
      </nav>
      <main className="app-main">
        {error && <p className="app-error">{error}</p>}
        {/* On desktop these become two columns; on phones they stack. */}
        <section className="app-main__map">
          <MarketMap plots={plots} searchResults={searchResults} selectedId={plotId} onSelectPlot={openPlot} />
        </section>
        <section className="app-main__list">
          {/* Desktop: the open card takes the list's place. The list is only
              hidden, so the search and scroll position are kept for "Back". */}
          {isDesktop && selectedPlot && (
            <PlotDetail inline key={selectedPlot.id} plot={selectedPlot} onClose={closePlot} onReported={loadPlots} />
          )}
          <div className="app-main__list-body" hidden={isDesktop && !!selectedPlot}>
            <div className="app-main__search">
              <SearchBar value={query} onChange={setQuery} />
            </div>
            <PlotTable plots={plots} searchResults={searchResults} onSelectPlot={openPlot} />
          </div>
        </section>
        {/* Phones: the card is a bottom sheet over the page. */}
        {!isDesktop && (
          <PlotDetail key={selectedPlot?.id} plot={selectedPlot} onClose={closePlot} onReported={loadPlots} />
        )}
      </main>
    </div>
  );
}

export default App;