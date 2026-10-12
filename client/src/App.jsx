import { useEffect, useState, useMemo } from 'react';
import MarketMap from './components/MarketMap';
import SearchBar from './components/SearchBar';
import PlotTable from './components/PlotTable';
import PlotDetail from './components/PlotDetail';
import { getSearchResults } from './lib/search';

function App() {
  const [plots, setPlots] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [selectedPlot, setSelectedPlot] = useState(null);

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
        <MarketMap plots={plots} searchResults={searchResults} onSelectPlot={setSelectedPlot} />
        <SearchBar value={query} onChange={setQuery} />
        <PlotTable plots={plots} searchResults={searchResults} onSelectPlot={setSelectedPlot} />
        <PlotDetail key={selectedPlot?.id} plot={selectedPlot} onClose={() => setSelectedPlot(null)} onReported={loadPlots} />
      </main>
    </div>
  );
}

export default App;