import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import MarketMap from './components/MarketMap';
import SearchBar from './components/SearchBar';
import PlotTable from './components/PlotTable';
import PlotDetail from './components/PlotDetail';
import { getSearchResults } from './lib/search';

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
  const openPlot = (plot) =>
    navigate(`/plot/${plot.id}`, { replace: !!plotId, state: { fromApp: plotId ? fromApp : true } });
  const closePlot = () => (fromApp ? navigate(-1) : navigate('/', { replace: true }));

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
          <MarketMap plots={plots} searchResults={searchResults} onSelectPlot={openPlot} />
        </section>
        <section className="app-main__list">
          <div className="app-main__search">
            <SearchBar value={query} onChange={setQuery} />
          </div>
          <PlotTable plots={plots} searchResults={searchResults} onSelectPlot={openPlot} />
        </section>
        <PlotDetail key={selectedPlot?.id} plot={selectedPlot} onClose={closePlot} onReported={loadPlots} />
      </main>
    </div>
  );
}

export default App;