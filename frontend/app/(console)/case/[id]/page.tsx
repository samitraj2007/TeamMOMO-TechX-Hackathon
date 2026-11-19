import { Suspense } from "react";
import { CaseView } from "@/components/case/CaseView";
import { LoadingState } from "@/components/primitives";

async function CaseFromParams({ params }: { params: PageProps<"/case/[id]">["params"] }) {
  const { id } = await params;
  return <CaseView id={id} />;
}

export default function CasePage(props: PageProps<"/case/[id]">) {
  return (
    <Suspense fallback={<LoadingState label="Opening case" />}>
      <CaseFromParams params={props.params} />
    </Suspense>
  );
}
