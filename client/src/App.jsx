import { useEffect, useState, useMemo } from 'react';
import MarketMap from './components/MarketMap';
import SearchBar from './components/SearchBar';
import PlotTable from './components/PlotTable';
import { getSearchResults } from './lib/search';

function App() {
  const [plots, setPlots] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/plots')
      .then((res) => res.json())
      .then(setPlots)
      .catch((err) => setError(err.message));
  }, []);

  const searchResults = useMemo(() => getSearchResults(plots, query), [plots, query]);

  const handleSelectPlot = (plot) => {
    console.log('Selected plot:', plot);
  };

  return (
    <div>
      <h1>Market Directory</h1>
      {error && <p>Error: {error}</p>}
      <MarketMap plots={plots} searchResults={searchResults} onSelectPlot={handleSelectPlot} />
      <SearchBar value={query} onChange={setQuery} />
      <PlotTable plots={plots} searchResults={searchResults} onSelectPlot={handleSelectPlot} />
    </div>
  );
}

export default App;