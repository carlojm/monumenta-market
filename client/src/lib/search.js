export function filterPlots(plots, query) {
  if (!query.trim()) return plots;
  const q = query.toLowerCase();

  return plots.filter((plot) => {
    const haystack = [
      plot.owner,
      plot.shop_name,
      plot.zone,
      plot.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}