// Compact number formatting for counts (views, likes, subscribers).
// Raw figures ("11320701", "163631 likes") overflow card footers and read
// as data dumps; pros render "11.3M" / "164K".

const compact = new Intl.NumberFormat('en', { notation: 'compact' });

export const formatCompact = (n: number | string | null | undefined): string => {
  const num = typeof n === 'string' ? Number(n) : n;
  if (num === null || num === undefined || !Number.isFinite(num)) return '0';
  return compact.format(num);
};
