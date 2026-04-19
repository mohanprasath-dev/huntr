"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import Navbar from "@/components/Navbar";

interface AppShellProps {
  children: ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const showNavbar = pathname.startsWith("/app");

  return (
    <>
      {showNavbar ? <Navbar /> : null}
      <div className={showNavbar ? "pt-16" : undefined}>{children}</div>
    </>
  );
}
