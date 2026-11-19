import { Suspense } from "react";
import { LoadingState } from "@/components/primitives";
import { TransactionsView } from "@/components/transactions/TransactionsView";

export default function TransactionsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading transactions" className="m-5" />}>
      <TransactionsView />
    </Suspense>
  );
}
