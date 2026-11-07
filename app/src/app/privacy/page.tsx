/**
 * The published privacy policy — PRIVACY-SPEC §6.
 *
 * A route rather than a link to a file, because §6 requires the text to be
 * *published*, and because the affiliate programme, the app stores' install
 * prompt, and anyone deciding whether to turn on §5.4's sharing toggle all need
 * a URL they can reach without an account.
 *
 * `force-static`: the document changes when the markdown changes, which is a
 * deploy. There is nothing per-user on this page and nothing to revalidate.
 */
import { notFound } from "next/navigation";
import { legalDoc } from "@/lib/legal";
import { LegalPage } from "@/components/LegalPage";

export const dynamic = "force-static";

export function generateMetadata() {
  return {
    title: "Privacy Policy · JipBap",
    description:
      "What JipBap keeps, what it never shares, and how to take it all with you.",
  };
}

export default function Privacy() {
  const doc = legalDoc("privacy-policy");
  if (!doc) notFound();
  return <LegalPage html={doc.html} />;
}
