"use client";

/*
  APPS SCRIPT CODE (replace existing script with this):

  function doPost(e) {
    const sheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getActiveSheet();
    sheet.appendRow([
      new Date().toISOString(),
      e.parameter.page,
      e.parameter.rating,
      e.parameter.feedback,
      e.parameter.email || ""
    ]);
    return ContentService
      .createTextResponse(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
*/

import { FormEvent, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const FEEDBACK_URL = "https://script.google.com/macros/s/AKfycbwIvyoNGg-03ntsCOE7W2aP27P9_gvx_8eOAyz6ZXTM7YL6IbTACxVy7EEieiVqaEzB/exec";

function isLikelyValidEmail(value: string): boolean {
  if (!value.trim()) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function FeedbackWidget() {
  const pathname = usePathname();

  const [isOpen, setIsOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isHuntPage = useMemo(() => pathname.includes("/hunt/"), [pathname]);
  const buttonPositionClass = isHuntPage
    ? "bottom-4 left-4 sm:bottom-6 sm:left-6"
    : "bottom-4 right-4 sm:bottom-6 sm:right-6";

  function resetFormState(): void {
    setRating(0);
    setHoveredRating(0);
    setFeedback("");
    setEmail("");
    setErrorMessage(null);
    setIsSending(false);
    setIsSuccess(false);
  }

  function handleOpen(): void {
    resetFormState();
    setIsOpen(true);
  }

  function handleClose(): void {
    setIsOpen(false);
    setHoveredRating(0);
    setErrorMessage(null);
  }

  useEffect(() => {
    if (!isOpen || !isSuccess) {
      return;
    }

    const timer = window.setTimeout(() => {
      handleClose();
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [isOpen, isSuccess]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedFeedback = feedback.trim();
    const trimmedEmail = email.trim();

    if (rating < 1) {
      setErrorMessage("Please select a star rating.");
      return;
    }

    if (trimmedFeedback.length < 10) {
      setErrorMessage("Feedback should be at least 10 characters.");
      return;
    }

    if (!isLikelyValidEmail(trimmedEmail)) {
      setErrorMessage("Please enter a valid email address or leave it blank.");
      return;
    }

    setErrorMessage(null);
    setIsSending(true);

    try {
      const page = typeof window !== "undefined" ? window.location.pathname : pathname;

      // Google Apps Script requires no-cors with form data
      const formData = new FormData();
      formData.append("page", page);
      formData.append("rating", String(rating));
      formData.append("feedback", feedback);
      formData.append("email", email);

      await fetch(FEEDBACK_URL, {
        method: "POST",
        mode: "no-cors",
        body: formData,
      });

      // no-cors always returns opaque response so we can't check response.ok
      setIsSuccess(true);
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`fixed ${buttonPositionClass} z-50 inline-flex items-center rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] transition-transform duration-200 hover:scale-[1.02] hover:shadow-[0_6px_16px_rgba(0,0,0,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827] focus-visible:ring-offset-2`}
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}
        aria-label="Open feedback form"
      >
        💬 Feedback
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-[#00000066] p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-widget-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6">
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111827]"
              aria-label="Close feedback dialog"
            >
              ✕
            </button>

            <h2 id="feedback-widget-title" className="pr-10 text-2xl font-bold text-[#111827]">
              Share your feedback
            </h2>
            <p className="mt-1 text-sm text-[#6b7280]">Help us improve HuntR</p>

            {isSuccess ? (
              <div className="mt-6 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-4">
                <p className="font-semibold text-[#15803d]">✅ Thanks for your feedback!</p>
                <p className="mt-1 text-sm text-[#6b7280]">We&apos;ll use this to make HuntR better.</p>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <p className="mb-2 text-sm font-medium text-[#111827]">Rating</p>
                  <div
                    className="flex items-center gap-1"
                    onMouseLeave={() => setHoveredRating(0)}
                    role="radiogroup"
                    aria-label="Feedback rating"
                  >
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isActive = (hoveredRating || rating) >= star;

                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoveredRating(star)}
                          onFocus={() => setHoveredRating(star)}
                          onBlur={() => setHoveredRating(0)}
                          onClick={() => setRating(star)}
                          className={`text-3xl leading-none transition ${
                            isActive ? "text-[#f59e0b]" : "text-[#e5e7eb]"
                          }`}
                          aria-label={`${star} star${star > 1 ? "s" : ""}`}
                          aria-pressed={rating === star}
                        >
                          ★
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="feedback-text" className="mb-2 block text-sm font-medium text-[#111827]">
                    Feedback
                  </label>
                  <textarea
                    id="feedback-text"
                    rows={4}
                    required
                    minLength={10}
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="What did you like? What can we improve?"
                    className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition focus:border-[#111827]"
                  />
                </div>

                <div>
                  <label htmlFor="feedback-email" className="mb-2 block text-sm font-medium text-[#111827]">
                    Email (optional)
                  </label>
                  <input
                    id="feedback-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="your@email.com (optional)"
                    className="w-full rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition focus:border-[#111827]"
                  />
                </div>

                {errorMessage ? <p className="text-sm text-[#dc2626]">{errorMessage}</p> : null}

                <button
                  type="submit"
                  disabled={isSending}
                  className="inline-flex w-full items-center justify-center rounded-full bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#111827] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSending ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Sending...
                    </span>
                  ) : (
                    "Send Feedback →"
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
