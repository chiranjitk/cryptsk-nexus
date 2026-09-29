"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { StickyNote, Pin, X, Trash2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "cryptsk-quick-notes";
const MAX_CHARS = 5000;
const DEBOUNCE_MS = 500;

export function QuickNotesWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });
  const [showSaved, setShowSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-save with debounce
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, notes);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 1500);
      } catch {
        // Silently fail if localStorage is full or unavailable
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [notes]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (value.length <= MAX_CHARS) {
        setNotes(value);
      } else {
        setNotes(value.slice(0, MAX_CHARS));
        toast.error(`Maximum ${MAX_CHARS.toLocaleString()} characters allowed`);
      }
    },
    []
  );

  const handleClear = useCallback(() => {
    setNotes("");
    toast.success("Notes cleared");
  }, []);

  const handleCopy = useCallback(async () => {
    if (!notes.trim()) {
      toast.info("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(notes);
      toast.success("Notes copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  }, [notes]);

  const togglePanel = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      // Small delay to let animation start
      const t = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  return (
    <>
      {/* Floating Toggle Button */}
      <button
        onClick={togglePanel}
        className={cn(
          "fixed bottom-20 right-6 z-50 flex items-center justify-center",
          "size-12 rounded-full shadow-lg transition-all duration-200",
          "bg-[#DC2626] text-white hover:bg-[#B91C1C]",
          "hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2",
          !isOpen && "animate-subtle-pulse"
        )}
        aria-label={isOpen ? "Close quick notes" : "Open quick notes"}
      >
        {isOpen ? (
          <X className="size-5" />
        ) : (
          <StickyNote className="size-5" />
        )}
      </button>

      {/* Notes Panel */}
      <div
        className={cn(
          "fixed bottom-36 right-6 z-50 w-80 max-w-[90vw] transition-all duration-300 ease-out",
          isOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-95 opacity-0"
        )}
      >
        <div
          className={cn(
            "rounded-xl border p-4 shadow-xl",
            "bg-background/80 backdrop-blur-xl border-border/60",
            "dark:bg-card/80"
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Pin className="size-4 text-[#DC2626]" />
              <h3 className="font-semibold text-sm">Quick Notes</h3>
            </div>
            {showSaved && (
              <span className="flex items-center gap-1 text-xs text-[#0D9488] animate-in fade-in slide-in-from-right-2 duration-200">
                <Check className="size-3" />
                Saved ✓
              </span>
            )}
          </div>

          {/* Textarea */}
          <Textarea
            ref={textareaRef}
            value={notes}
            onChange={handleChange}
            placeholder="Type your notes here... Auto-saves as you type."
            className={cn(
              "min-h-[150px] max-h-[400px] resize-y text-sm",
              "bg-muted/50 border-border/50"
            )}
          />

          {/* Character Count */}
          <div className="mt-2 flex items-center justify-between">
            <span
              className={cn(
                "text-xs text-muted-foreground",
                notes.length >= MAX_CHARS && "text-destructive font-medium"
              )}
            >
              {notes.length.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
            </span>
          </div>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="flex-1 text-xs h-8"
            >
              <Copy className="size-3" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              className="flex-1 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
