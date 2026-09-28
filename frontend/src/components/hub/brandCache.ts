import type { BrandSummary } from "../../api/types";

// The last brand list seen, kept in memory so the pages on either side of a View Transition can
// render their real content on the first frame: the hub's centre card knows the brand's name and
// question count before its own fetch lands, and going back to the list shows the cards (not the
// loading skeleton) so the centre card can morph back into its grid slot.

let brands: BrandSummary[] | null = null;

export function rememberBrands(list: BrandSummary[]): BrandSummary[] {
  brands = list;
  return list;
}

/** The cached brand list, or null before the list has loaded once. */
export function peekBrands(): BrandSummary[] | null {
  return brands;
}

export function peekBrandSummary(brandKey: string): BrandSummary | undefined {
  return brands?.find((b) => b.brand_key === brandKey);
}

export function forgetBrand(brandKey: string): void {
  if (brands) brands = brands.filter((b) => b.brand_key !== brandKey);
}
