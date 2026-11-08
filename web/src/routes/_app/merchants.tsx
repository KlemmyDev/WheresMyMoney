import { createFileRoute } from "@tanstack/react-router";
import { MerchantsPage, type MerchantSearch } from "~/features/merchants/MerchantsPage";

const SORTS = ["spent", "recent", "name"] as const;

export const Route = createFileRoute("/_app/merchants")({
  // ?sort=recent, ?dir=in for money in, ?unset=1 for merchants without a default, ?q=wool to search.
  validateSearch: (s: Record<string, unknown>): MerchantSearch => ({
    sort: SORTS.includes(s.sort as (typeof SORTS)[number]) ? (s.sort as MerchantSearch["sort"]) : undefined,
    dir: s.dir === "in" ? "in" : undefined,
    unset: s.unset === true || s.unset === 1 || s.unset === "1" ? true : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  head: () => ({ meta: [{ title: "Merchants · WheresMyMoney" }] }),
  component: function Merchants() {
    return <MerchantsPage search={Route.useSearch()} />;
  },
});
