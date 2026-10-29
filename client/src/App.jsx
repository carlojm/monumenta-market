import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Navbar from './components/Navbar';
import MarketMap from './components/MarketMap';
import SearchBar from './components/SearchBar';
import PlotTable from './components/PlotTable';
import PlotDetail from './components/PlotDetail';
import SortMenu from './components/SortMenu';
import { FilterButton, FilterChips } from './components/Filters';
import { filterMatches, filterPlots, isActive, newFilter } from './lib/filters';
import { getSearchResults } from './lib/search';
import { defaultSort, sortPlots } from './lib/sort';
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

  // Tags, for the filter popup.
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    fetch('/api/tags').then((res) => res.json()).then(setCatalog).catch(() => {});
  }, []);

  // Filters hide plots from the list; search then ranks and dims what's left.
  // The map dims everything outside both.
  const [filters, setFilters] = useState([]);
  const [openFilterId, setOpenFilterId] = useState(null);
  const addFilter = (type) => {
    const filter = newFilter(type);
    setFilters((list) => [...list, filter]);
    if (type !== 'occupied') setOpenFilterId(filter.id); // nothing to choose for "hide vacant"
  };
  // A tag picked from the search bar's suggestions becomes its own filter.
  const addTagFilter = (tagId) => setFilters((list) => [...list, { ...newFilter('tags'), tagIds: [tagId] }]);
  const filteredTagIds = filters.flatMap((f) => (f.type === 'tags' ? f.tagIds : []));
  const zones = useMemo(() => [...new Set(plots.map((p) => p.zone))].sort((a, b) => a.localeCompare(b)), [plots]);
  const updateFilter = (filter) => setFilters((list) => list.map((f) => (f.id === filter.id ? filter : f)));
  const removeFilter = useCallback((id) => setFilters((list) => list.filter((f) => f.id !== id)), []);
  const filtering = filters.some(isActive);
  const filteredPlots = useMemo(() => filterPlots(plots, filters), [plots, filters]);

  const searchResults = useMemo(() => getSearchResults(filteredPlots, query), [filteredPlots, query]);
  const highlightIds = searchResults ? searchResults.matchedIds
    : filtering ? new Set(filteredPlots.map((p) => p.id)) : null;

  // A sort the player picked stays while they search; otherwise it's newest
  // update first, or best match while searching.
  const [pickedSort, setPickedSort] = useState(null);
  const searching = !!searchResults;
  const sort = pickedSort && (searching || pickedSort.key !== 'best') ? pickedSort : defaultSort(searching);
  const rows = sortPlots(filteredPlots, searchResults, sort);

  const cardOpenOnDesktop = isDesktop && !!selectedPlot;
  const list = (
    <div className="app-main__list-body">
      <div className="app-main__search">
        <div className="toolbar">
          <SearchBar value={query} onChange={setQuery} catalog={catalog} skipTagIds={filteredTagIds}
            onPickTag={addTagFilter} />
          <FilterButton filters={filters} onAdd={addFilter} />
          <SortMenu sort={sort} onChange={setPickedSort} searching={searching} />
        </div>
        <FilterChips filters={filters} catalog={catalog} zones={zones} openId={openFilterId} onOpen={setOpenFilterId}
          onChange={updateFilter} onRemove={removeFilter} onClear={() => setFilters([])} />
      </div>
      {filtering && rows.length === 0 ? (
        <p className="app-main__empty">No shops match these filters.</p>
      ) : (
        <PlotTable rows={rows} searchResults={searchResults} tagMatches={filterMatches(filteredPlots, filters)}
          onSelectPlot={openPlot} />
      )}
    </div>
  );

  return (
    <div>
      <Navbar />
      <main className="app-main">
        {error && <p className="app-error">{error}</p>}
        {/* On desktop these become two columns; on phones they stack.
            With a card open on desktop, the card takes the right column and
            the search + table move under the map so you can keep browsing. */}
        <section className={`app-main__map${cardOpenOnDesktop ? ' app-main__map--with-list' : ''}`}>
          <MarketMap plots={plots} highlightIds={highlightIds} selectedId={plotId} onSelectPlot={openPlot} />
          {cardOpenOnDesktop && list}
        </section>
        <section className="app-main__list">
          {cardOpenOnDesktop ? (
            <PlotDetail inline key={selectedPlot.id} plot={selectedPlot} onClose={closePlot} onReported={loadPlots} />
          ) : (
            list
          )}
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