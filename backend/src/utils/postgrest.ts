// PostgREST `.or()` parameters use commas as the OR separator and parens for
// grouping, so a raw search term containing them (e.g. "waves, optics" or
// "math (grade 9)") parses as multiple broken conditions and PostgREST 400s
// — which our routes turned into a 500. Strip the syntax characters before
// interpolating; matching stays substring-based.
export const sanitizeOrTerm = (term: string): string => term.replace(/[,()]/g, '').trim();
