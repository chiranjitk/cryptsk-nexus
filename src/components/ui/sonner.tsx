"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"
import { useEffect, useState } from "react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system", resolvedTheme } = useTheme()
  // Default to "light" until resolvedTheme is available to prevent
  // Sonner from falling back to system dark theme during SSR hydration
  const effectiveTheme = resolvedTheme || "light"

  // Re-inject CSS overrides whenever theme changes
  useEffect(() => {
    const isDark = effectiveTheme === "dark"
    // Remove any previous fix
    const prev = document.getElementById("cryptsk-toast-inline-fix")
    if (prev) prev.remove()

    // Inject style directly into document head for maximum specificity
    const style = document.createElement("style")
    style.id = "cryptsk-toast-inline-fix"
    style.textContent = `
      /* Force light theme toast styles */
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] {
        background: #FFFFFF !important;
        color: #111827 !important;
        border-color: #D1FAE5 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] [data-title] {
        color: #111827 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] [data-description] {
        color: #4B5563 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] {
        background: #FFFFFF !important;
        color: #111827 !important;
        border-color: #FCA5A5 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] [data-title] {
        color: #111827 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] [data-description] {
        color: #4B5563 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] {
        background: #FFFFFF !important;
        color: #111827 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] [data-title] {
        color: #111827 !important;
      }
      [data-sonner-toaster][data-sonner-theme="light"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] [data-description] {
        color: #4B5563 !important;
      }
      /* Dark theme */
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] {
        background: #1E293B !important;
        color: #F1F5F9 !important;
        border-color: #065F46 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] [data-title] {
        color: #F1F5F9 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="success"] [data-description] {
        color: #94A3B8 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] {
        background: #1E293B !important;
        color: #F1F5F9 !important;
        border-color: #7F1D1D !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] [data-title] {
        color: #F1F5F9 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-type="error"] [data-description] {
        color: #94A3B8 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] {
        background: #1E293B !important;
        color: #F1F5F9 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] [data-title] {
        color: #F1F5F9 !important;
      }
      [data-sonner-toaster][data-sonner-theme="dark"][data-rich-colors="false"] [data-sonner-toast][data-styled="true"] [data-description] {
        color: #94A3B8 !important;
      }
    `
    document.head.appendChild(style)

    return () => {
      style.remove()
    }
  }, [effectiveTheme])

  return (
    <Sonner
      theme={effectiveTheme as ToasterProps["theme"]}
      className="toaster group"
      richColors={false}
      {...props}
    />
  )
}

export { Toaster }
