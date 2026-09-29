"use client";

import { useEffect, useCallback } from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

const isChunkError = (err: Error) =>
  err.message?.includes("Failed to load chunk") ||
  err.message?.includes("ChunkLoadError") ||
  err.message?.includes("Loading chunk") ||
  err.message?.includes("Loading CSS chunk");

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Page Error]", error);
  }, [error]);

  const handleFullReload = useCallback(() => {
    // For chunk errors, a full window reload is the most reliable fix
    // because it re-fetches all chunks from scratch
    window.location.reload();
  }, []);

  const chunk = isChunkError(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${
            chunk ? "bg-amber-500/10" : "bg-destructive/10"
          }`}
        >
          <AlertTriangle
            className={`h-8 w-8 ${chunk ? "text-amber-500" : "text-destructive"}`}
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {chunk ? "Page Failed to Load" : "Something went wrong"}
          </h2>
          <p className="text-muted-foreground">
            {chunk
              ? "A required resource could not be loaded. This usually resolves with a page reload."
              : "An unexpected error occurred. Please try again or contact your administrator."}
          </p>
        </div>
        {error.message && (
          <div className="rounded-lg bg-muted p-3 text-left">
            <p className="text-sm font-mono text-muted-foreground break-all">
              {error.message}
            </p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={chunk ? handleFullReload : reset}
            variant="default"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {chunk ? "Reload Page" : "Try Again"}
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="outline"
          >
            <Home className="h-4 w-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
