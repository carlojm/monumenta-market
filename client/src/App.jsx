import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import Navbar from './components/Navbar';
import MarketMap from './components/MarketMap';
import SearchBar, { SearchTagSuggestions } from './components/SearchBar';
import PlotTable from './components/PlotTable';
import PlotDetail from './components/PlotDetail';
import SortMenu from './components/SortMenu';
import { FilterButton, FilterChips } from './components/Filters';
import { filterMatches, filterPlots, isActive, newFilter } from './lib/filters';
import { createSearchIndex, getSearchResults } from './lib/search';
import { defaultSort, sortPlots } from './lib/sort';
import { DESKTOP_QUERY, useMediaQuery } from './lib/useMediaQuery';
import { plotsResource, tagsResource, useResource } from './lib/resource';

function App() {
  // The plots and the tag list load when the page first shows (lib/resource.js).
  const { data: plots, error } = useResource(plotsResource);
  const catalog = useResource(tagsResource).data;
  const loadPlots = () => plotsResource.refresh();
  const [query, setQuery] = useState('');
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
  // Stable (useCallback), so the memoized map and table don't re-render for it.
  const openPlot = useCallback((plot) => {
    if (!plotId) listScroll.current = window.scrollY;
    navigate(`/plot/${plot.id}`, { replace: !!plotId, state: { fromApp: plotId ? fromApp : true } });
  }, [plotId, fromApp, navigate]);
  const closePlot = () => (fromApp ? navigate(-1) : navigate('/', { replace: true }));

  // Desktop: the card replaces the list, so start the card at the top and
  // put the list back where it was on "Back", with focus back on the row
  // that opened the card (phones get this from the card's dialog). Ref
  // callbacks: they run when the card or the list appears.
  const lastOpened = useRef(null);
  const cardShown = useCallback((el) => {
    if (!el) return;
    window.scrollTo(0, 0);
    lastOpened.current = el.dataset.plotId;
  }, []);
  const listBack = useCallback((el) => {
    if (!el || !lastOpened.current) return;
    window.scrollTo(0, listScroll.current);
    document.querySelector(`.plot-table__open[data-plot-id="${CSS.escape(lastOpened.current)}"]`)
      ?.focus({ preventScroll: true });
    lastOpened.current = null;
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
  // A tag picked from the search bar's suggestions joins the first "has any of"
  // tag filter (so picks are ORed), or starts one. The text that found it is
  // cleared: the tag replaces it, rather than narrowing it further.
  const addTagFilter = (tagId) => {
    setQuery('');
    setFilters((list) => {
      const anyFilter = list.find((f) => f.type === 'tags' && f.mode === 'any');
      if (!anyFilter) return [...list, { ...newFilter('tags'), tagIds: [tagId] }];
      return list.map((f) => (f === anyFilter ? { ...f, tagIds: [...f.tagIds, tagId] } : f));
    });
  };
  const filteredTagIds = filters.flatMap((f) => (f.type === 'tags' ? f.tagIds : []));
  const zones = useMemo(() => [...new Set(plots.map((p) => p.zone))].sort((a, b) => a.localeCompare(b)), [plots]);
  const updateFilter = (filter) => setFilters((list) => list.map((f) => (f.id === filter.id ? filter : f)));
  const removeFilter = useCallback((id) => setFilters((list) => list.filter((f) => f.id !== id)), []);
  const filtering = filters.some(isActive);
  const filteredPlots = useMemo(() => filterPlots(plots, filters), [plots, filters]);

  // Typing stays quick: the box shows each letter at once, and the search,
  // the table and the map follow with the deferred text, which React works on
  // in the background and drops if another letter comes first. The map and
  // table are memoized, so they skip the letter-only render; everything they
  // get below is made once per real change.
  const deferredQuery = useDeferredValue(query);
  const searchIndex = useMemo(() => createSearchIndex(filteredPlots), [filteredPlots]);
  const searchResults = useMemo(() => getSearchResults(searchIndex, deferredQuery), [searchIndex, deferredQuery]);
  const highlightIds = useMemo(() => (searchResults ? searchResults.matchedIds
    : filtering ? new Set(filteredPlots.map((p) => p.id)) : null), [searchResults, filtering, filteredPlots]);

  // A sort the player picked stays while they search; otherwise it's newest
  // update first, or best match while searching.
  const [pickedSort, setPickedSort] = useState(null);
  const searching = !!searchResults;
  const sort = pickedSort && (searching || pickedSort.key !== 'best') ? pickedSort : defaultSort(searching);
  const rows = useMemo(() => sortPlots(filteredPlots, searchResults, { key: sort.key, reversed: sort.reversed }),
    [filteredPlots, searchResults, sort.key, sort.reversed]);
  const tagMatches = useMemo(() => filterMatches(filteredPlots, filters), [filteredPlots, filters]);

  const cardOpenOnDesktop = isDesktop && !!selectedPlot;
  const list = (
    <div className="app-main__list-body">
      <div className="app-main__search">
        <div className="toolbar">
          <SearchBar value={query} onChange={setQuery} />
          <FilterButton filters={filters} onAdd={addFilter} />
          <SortMenu sort={sort} onChange={setPickedSort} searching={searching} />
        </div>
        <SearchTagSuggestions query={query} catalog={catalog} skipTagIds={filteredTagIds}
          onPick={addTagFilter} />
        <FilterChips filters={filters} catalog={catalog} zones={zones} openId={openFilterId} onOpen={setOpenFilterId}
          onChange={updateFilter} onRemove={removeFilter} onClear={() => setFilters([])} />
      </div>
      {filtering && rows.length === 0 ? (
        <p className="app-main__empty">No shops match these filters.</p>
      ) : (
        <PlotTable rows={rows} searchResults={searchResults} tagMatches={tagMatches}
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
            // A new wrapper per card (its key), so cardShown runs for each one.
            <div className="app-main__card" key={selectedPlot.id} ref={cardShown} data-plot-id={selectedPlot.id}>
              <PlotDetail inline plot={selectedPlot} plots={plots} catalog={catalog} onClose={closePlot} onReported={loadPlots}
                openedInApp={fromApp} />
            </div>
          ) : (
            // Its own wrapper, so listBack runs when the list comes back.
            <div className="app-main__list-wrap" ref={listBack}>{list}</div>
          )}
        </section>
        {/* Phones: the card is a bottom sheet over the page. */}
        {!isDesktop && (
          <PlotDetail key={selectedPlot?.id} plot={selectedPlot} plots={plots} catalog={catalog} onClose={closePlot} onReported={loadPlots} />
        )}
      </main>
    </div>
  );
}

export default App;