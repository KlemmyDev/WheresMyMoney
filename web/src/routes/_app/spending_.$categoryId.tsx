import { createFileRoute } from "@tanstack/react-router";
import { CategoryPage } from "~/features/spending/CategoryPage";

export const Route = createFileRoute("/_app/spending_/$categoryId")({
  head: () => ({ meta: [{ title: "Category · WheresMyMoney" }] }),
  component: function Category() {
    const { categoryId } = Route.useParams();
    return <CategoryPage key={categoryId} categoryId={Number(categoryId)} />;
  },
});
