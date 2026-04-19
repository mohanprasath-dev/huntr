import type { Metadata } from "next";
import LandingPageClient from "@/components/LandingPageClient";

export const metadata: Metadata = {
  title: "HuntR - Your AI Sales Team. Without the Payroll.",
  description:
    "5 autonomous AI agents that find, research, score and personally message your next B2B client in under 2 minutes.",
  openGraph: {
    title: "HuntR - Your AI Sales Team. Without the Payroll.",
    description:
      "5 autonomous AI agents that find, research, score and personally message your next B2B client in under 2 minutes.",
    images: ["/og-image.png"],
  },
  twitter: {
    title: "HuntR - Your AI Sales Team. Without the Payroll.",
    description:
      "5 autonomous AI agents that find, research, score and personally message your next B2B client in under 2 minutes.",
    images: ["/og-image.png"],
  },
};

export default function LandingPage() {
  return <LandingPageClient />;
}
