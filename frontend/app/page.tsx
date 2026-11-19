"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .cases()
      .then((cases) => {
        if (cases.length) router.replace(`/case/${cases[0].alert_id}`);
        else setError("No demo cases found. Reset the demo dataset.");
      })
      .catch((e) => setError(errorMessage(e)));
  }, [router]);

  return (
    <main className="flex flex-1 items-center justify-center p-10 text-sm text-muted">
      {error ? (
        <div className="max-w-md rounded border border-approve/40 bg-approve/10 px-4 py-3 text-approve">
          {error}
          <div className="mt-2 text-faint">Start the backend: uvicorn backend.app.main:app --port 8000</div>
        </div>
      ) : (
        "Opening console…"
      )}
    </main>
  );
}
