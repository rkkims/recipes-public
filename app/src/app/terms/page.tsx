/**
 * The published terms of service.
 *
 * Sits beside `/privacy` for the same reasons, plus one of its own: §6 is where
 * the affiliate relationship is disclosed in full, and a disclosure has to be
 * somewhere a reader can get to from the link that earns the commission.
 */
import { notFound } from "next/navigation";
import { legalDoc } from "@/lib/legal";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-static";

export function generateMetadata() {
  return {
    title: "Terms of Service · JipBap",
    description:
      "What JipBap is, what it does not promise, and how the affiliate links work.",
  };
}

export default function Terms() {
  const doc = legalDoc("terms");
  if (!doc) notFound();
  return <LegalPage html={doc.html} />;
}
