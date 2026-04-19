"use client";

import type { CSSProperties } from "react";

interface LoadingSkeletonProps {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
}

export default function LoadingSkeleton({
  width = "100%",
  height = "36rem",
  borderRadius = "1rem",
}: LoadingSkeletonProps) {
  const containerStyle: CSSProperties = {
    width,
    height,
    borderRadius,
  };

  return (
    <article
      className="loading-skeleton-card border border-white/10 bg-[#141922] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.35)]"
      style={containerStyle}
      aria-hidden="true"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="skeleton-shimmer h-5 w-44 rounded-md" />
            <div className="skeleton-shimmer h-4 w-28 rounded-md" />
          </div>
          <div className="skeleton-shimmer h-12 w-12 rounded-full" />
        </header>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="skeleton-shimmer h-24 rounded-xl" />
          <div className="skeleton-shimmer h-24 rounded-xl" />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <div className="skeleton-shimmer h-28 rounded-xl" />
          <div className="skeleton-shimmer h-28 rounded-xl" />
        </div>

        <div className="mt-4 skeleton-shimmer h-16 rounded-xl" />

        <footer className="mt-auto pt-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="skeleton-shimmer h-11 flex-1 rounded-lg" />
            <div className="skeleton-shimmer h-11 w-full rounded-lg md:w-52" />
          </div>
        </footer>
      </div>

      <style jsx>{`
        .loading-skeleton-card {
          overflow: hidden;
          position: relative;
        }

        .skeleton-shimmer {
          background: linear-gradient(
            90deg,
            rgba(55, 65, 81, 0.68) 0%,
            rgba(131, 139, 154, 0.82) 50%,
            rgba(55, 65, 81, 0.68) 100%
          );
          background-size: 220% 100%;
          animation: shimmer 1.45s linear infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -120% 0;
          }
          100% {
            background-position: 120% 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .skeleton-shimmer {
            animation: none;
          }
        }
      `}</style>
    </article>
  );
}
