"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const TagIcon = ({ d, className = "" }: { d: string; className?: string }) => (
    <svg className={`w-3.5 h-3.5 mr-1.5 inline-block ${className}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
);

const POSITIVE_TAGS = [
    { id: "fast", label: "Fast & smooth", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
    { id: "great_quality", label: "Great quality", icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" },
    { id: "stable", label: "Stable & reliable", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { id: "easy", label: "Easy to use", icon: "M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "everything_great", label: "Everything was great!", icon: "M5 13l4 4L19 7" },
];

const NEGATIVE_TAGS = [
    { id: "slow", label: "Slow performance", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "poor_quality", label: "Poor quality", icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" },
    { id: "unstable", label: "Unstable / crashes", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" },
    { id: "hard_to_use", label: "Hard to use", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01" },
    { id: "other_issue", label: "Other issue", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
];


function SurveyContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const sessionId = searchParams.get("sessionId") || "";
    const reason = searchParams.get("reason") || "";

    const [rating, setRating] = useState(0);
    const [hoveredStar, setHoveredStar] = useState(0);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [comment, setComment] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [redirectCountdown, setRedirectCountdown] = useState(3);

    const apiUrl = typeof window !== "undefined" ? window.location.origin : "";

    const sessionEndedUrl = `/session-ended${reason ? `?reason=${reason}` : ""}`;

    const toggleTag = (tagId: string) => {
        setSelectedTags(prev =>
            prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
        );
    };

    const handleSubmit = async () => {
        if (rating === 0 || submitting) return;
        setSubmitting(true);
        try {
            await fetch(`${apiUrl}/api/survey`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sessionId,
                    rating,
                    tags: selectedTags,
                    comment: comment.trim() || undefined,
                }),
            });
            setSubmitted(true);
        } catch {
            // Even on error, let them continue
            router.replace(sessionEndedUrl);
        }
    };

    const handleSkip = () => {
        router.replace(sessionEndedUrl);
    };

    // If no sessionId, skip survey
    if (!sessionId) {
        router.replace(sessionEndedUrl);
        return null;
    }

    useEffect(() => {
        if (!submitted) return;
        if (redirectCountdown <= 0) {
            router.replace(sessionEndedUrl);
            return;
        }
        const timer = setTimeout(() => setRedirectCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [submitted, redirectCountdown]);

    if (submitted) {
        return (
            <div className="text-center animate-in fade-in duration-500">
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-xl font-semibold text-white mb-2">Thank you!</h2>
                <p className="text-white/40 text-sm">Your feedback helps us improve.</p>
                <p className="text-white/25 text-xs mt-4">Redirecting in {redirectCountdown}s...</p>
            </div>
        );
    }

    const displayStars = hoveredStar || rating;

    return (
        <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-400/10 border border-amber-400/20 mb-4">
                    <svg className="w-7 h-7 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-white mb-1">How was your session?</h1>
                <p className="text-white/40 text-sm">Quick feedback to help us improve</p>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2 mb-2">
                {[1, 2, 3, 4, 5].map((star) => (
                    <button
                        key={star}
                        onClick={() => {
                            const wasPositive = rating >= 3;
                            const willBePositive = star >= 3;
                            if (wasPositive !== willBePositive) setSelectedTags([]);
                            setRating(star);
                        }}
                        onMouseEnter={() => setHoveredStar(star)}
                        onMouseLeave={() => setHoveredStar(0)}
                        className="group cursor-pointer p-1"
                    >
                        <svg
                            className={`w-10 h-10 block pointer-events-none transition-all duration-150 group-hover:scale-110 group-active:scale-95 ${star <= displayStars
                                ? "text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                : "text-white/10 group-hover:text-white/20"
                                }`}
                            fill={star <= displayStars ? "currentColor" : "none"}
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                    </button>
                ))}
            </div>

            {/* Rating label — always rendered to prevent layout shift */}
            <p className={`text-center text-sm h-6 mb-4 transition-opacity duration-200 ${displayStars > 0 ? "text-white/50 opacity-100" : "opacity-0"}`}>
                {displayStars > 0 ? ["", "Poor", "Fair", "Good", "Great", "Excellent"][displayStars] : "\u00A0"}
            </p>

            {/* Tags */}
            {rating > 0 && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <p className="text-xs text-white/30 uppercase tracking-wider mb-2.5 text-center">
                        {rating >= 3 ? "What did you like?" : "What could be better?"}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 mb-6">
                        {(rating >= 3 ? POSITIVE_TAGS : NEGATIVE_TAGS).map((tag) => (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer border ${selectedTags.includes(tag.id)
                                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                    : "bg-white/[0.03] text-white/40 border-white/5 hover:bg-white/[0.06] hover:text-white/60"
                                    }`}
                            >
                                <TagIcon d={tag.icon} />
                                {tag.label}
                            </button>
                        ))}
                    </div>

                    {/* Comment */}
                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value.slice(0, 200))}
                        placeholder="Anything else? (optional)"
                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 resize-none mb-1"
                        rows={2}
                    />
                    <div className="flex justify-end mb-5">
                        <span className={`text-[10px] ${comment.length >= 180 ? "text-amber-400" : "text-white/15"}`}>
                            {comment.length}/200
                        </span>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="space-y-3">
                <button
                    onClick={handleSubmit}
                    disabled={rating === 0 || submitting}
                    className={`w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${rating > 0
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30"
                        : "bg-white/5 text-white/20 border border-white/5 cursor-default"
                        }`}
                >
                    {submitting ? "Submitting..." : "Submit"}
                </button>
                <button
                    onClick={handleSkip}
                    className="w-full text-center text-sm text-white/25 hover:text-white/50 transition-colors cursor-pointer"
                >
                    Skip
                </button>
            </div>
        </div>
    );
}

export default function SurveyPage() {
    return (
        <main className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
            <Suspense fallback={
                <div className="text-white/30 text-sm">Loading...</div>
            }>
                <SurveyContent />
            </Suspense>
        </main>
    );
}
