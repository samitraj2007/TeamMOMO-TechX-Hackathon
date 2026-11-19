import { Suspense } from "react";
import { LoadingState } from "@/components/primitives";
import { ConsoleFrame } from "@/components/shell/ConsoleFrame";

export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-[calc(100svh-56px)] min-h-0 flex-col overflow-hidden">
      <Suspense fallback={<LoadingState label="Opening the console" className="m-6" />}>
        <ConsoleFrame>{children}</ConsoleFrame>
      </Suspense>
    </div>
  );
}
