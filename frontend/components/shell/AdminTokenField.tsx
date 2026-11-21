"use client";

import { useState } from "react";
import { Button, Field, Input } from "@/components/primitives";
import { setAdminToken, useAdminToken } from "@/lib/adminToken";
import { api, describeControlError } from "@/lib/api";
import { cx } from "@/lib/cx";

type Check = { state: "idle" | "checking" | "ok" | "bad"; text?: string };

/** One admin token for all demo controls in this tab, with a side-effect-free check against the backend. */
export function AdminTokenField({ className }: { className?: string }) {
  const token = useAdminToken();
  const [check, setCheck] = useState<Check>({ state: "idle" });

  async function verify() {
    setCheck({ state: "checking" });
    try {
      await api.demoCheck(token);
      setCheck({ state: "ok", text: "Accepted" });
    } catch (e) {
      setCheck({ state: "bad", text: describeControlError(e).title });
    }
  }

  const hint =
    check.state === "ok" ? "Accepted · kept in this tab only"
    : check.state === "bad" ? check.text
    : check.state === "checking" ? "Checking…"
    : token ? "Set · kept in this tab only" : "Needed to start the feed or arm a drill";

  return (
    <Field label="Admin token" htmlFor="admin-token" hint={<span className={cx(check.state === "ok" && "text-sage", check.state === "bad" && "text-red-text")}>{hint}</span>} className={className}>
      <div className="flex items-center gap-2">
        <Input id="admin-token" type="password" autoComplete="off" value={token} className="min-w-0 flex-1"
          onChange={(e) => { setAdminToken(e.target.value); setCheck({ state: "idle" }); }} />
        <Button type="button" size="sm" variant="outline" disabled={!token || check.state === "checking"} onClick={() => void verify()}>
          Check
        </Button>
      </div>
    </Field>
  );
}
