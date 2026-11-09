import { createFileRoute } from "@tanstack/react-router";
import { GoalPage } from "~/features/goals/GoalPage";

export const Route = createFileRoute("/_app/goals_/$goalId")({
  head: () => ({ meta: [{ title: "Goal · WheresMyMoney" }] }),
  component: function GoalRoute() {
    const { goalId } = Route.useParams();
    return <GoalPage id={Number(goalId)} />;
  },
});
