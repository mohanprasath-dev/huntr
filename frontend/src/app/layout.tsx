import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import AppShell from "@/components/AppShell";
import FeedbackWidget from "@/components/FeedbackWidget";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HuntR — Autonomous B2B Client Acquisition",
    template: "%s | HuntR",
  },
  description:
    "5 AI agents that find, research, score and personally message your next B2B client in under 2 minutes. Built for Indian startups.",
  keywords: [
    "B2B sales automation",
    "AI sales agent",
    "lead generation India",
    "autonomous outreach",
    "Google ADK",
    "multi-agent AI",
    "cold email automation",
    "Indian startup tools",
  ],
  authors: [{ name: "Mohan Prasath P", url: "https://www.mohanprasath.dev" }],
  creator: "Mohan Prasath P",
  metadataBase: new URL("https://huntr.mohanprasath.dev"),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: "https://huntr.mohanprasath.dev",
    title: "HuntR — Your AI Sales Team. Without the Payroll.",
    description:
      "5 autonomous AI agents that find, research, score and personally message your next B2B client in under 2 minutes.",
    siteName: "HuntR",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "HuntR — Autonomous B2B Client Acquisition",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HuntR — Your AI Sales Team. Without the Payroll.",
    description:
      "5 autonomous AI agents that find, research, score and personally message your next B2B client in under 2 minutes.",
    images: ["/og-image.png"],
    creator: "@mohanprasath",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://huntr.mohanprasath.dev",
  },
};

export const viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${ibmPlexMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
        <FeedbackWidget />
      </body>
    </html>
  );
}
