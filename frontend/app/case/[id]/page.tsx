import { Suspense } from "react";
import CaseScreen from "@/components/CaseScreen";

async function CaseFromParams({ params }: { params: PageProps<"/case/[id]">["params"] }) {
  const { id } = await params;
  return <CaseScreen id={id} />;
}

export default function CasePage(props: PageProps<"/case/[id]">) {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading case…</div>}>
      <CaseFromParams params={props.params} />
    </Suspense>
  );
}
