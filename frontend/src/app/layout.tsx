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
  title: "HuntR — Autonomous B2B Client Acquisition",
  description:
    "5 AI agents that find, research, score and personally message your next B2B client in under 2 minutes. Built for Indian startups.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "HuntR — Autonomous B2B Client Acquisition",
    description:
      "5 AI agents that find, research, score and personally message your next B2B client in under 2 minutes. Built for Indian startups.",
    url: "https://huntr.app",
    type: "website",
  },
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
