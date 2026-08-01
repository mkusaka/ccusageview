export function getNextHiddenSeriesForLabelClick(
  hiddenSeries: ReadonlySet<string>,
  seriesKeys: readonly string[],
  key: string,
): Set<string> {
  const visibleKeys = seriesKeys.filter((seriesKey) => !hiddenSeries.has(seriesKey));
  const isOnlyVisibleSeries = visibleKeys.length === 1 && visibleKeys[0] === key;
  const nextHiddenSeries = new Set(hiddenSeries);

  for (const seriesKey of seriesKeys) {
    if (isOnlyVisibleSeries || seriesKey === key) nextHiddenSeries.delete(seriesKey);
    else nextHiddenSeries.add(seriesKey);
  }

  return nextHiddenSeries;
}
