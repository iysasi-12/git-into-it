

export function InApp({ plan }: { plan: { options: Parameters<typeof CostChart>[0]["options"] } }) {
  return <CostChart options={plan.options} />;
}
import { CostChart } from "./CostChart";