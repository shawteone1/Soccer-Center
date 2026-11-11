/**
 * ArenaCard — shared image-backed entry card used on the homepage (ArenaSection)
 * and inside the in-app ArenaChooserModal.
 *
 * Identical imagery, overlays, typography, badge, and Enter button in both contexts.
 */

import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

export interface ArenaCardProps {
  badge: string;
  title: string;
  tagline: string;
  /** Slot URL, e.g. /airo-assets/images/pages/home/arena-fan */
  imageSlot: string;
  /** CSS variable name for the accent colour, e.g. '--primary' */
  accentVar: string;
  /** Motion entrance delay in seconds */
  delay?: number;
  /** Minimum card height — defaults to 420px */
  minHeight?: number;
  onClick: () => void;
}

export default function ArenaCard({
  badge,
  title,
  tagline,
  imageSlot,
  accentVar,
  delay = 0,
  minHeight = 420,
  onClick,
}: ArenaCardProps) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay, ease: 'easeOut' as const }}
      whileHover={{ scale: 1.015 }}
      whileTap={{ scale: 0.985 }}
      className="group relative w-full overflow-hidden rounded-3xl text-left focus-visible:outline-none focus-visible:ring-4"
      style={{ minHeight }}
      aria-label={`Enter ${title}`}
    >
      {/* Background image */}
      <img
        src={imageSlot}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        loading="lazy"
      />

      {/* Dark gradient overlay — bottom-heavy for text legibility */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(to top, hsl(var(--arena-overlay-dark) / 0.82) 0%, hsl(var(--arena-overlay-dark) / 0.45) 45%, hsl(var(--arena-overlay-dark) / 0.18) 100%)`,
        }}
      />

      {/* Accent tint on hover */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-20 transition-opacity duration-500"
        style={{ background: `hsl(var(${accentVar}))` }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col justify-end h-full p-8 sm:p-10"
        style={{ minHeight }}
      >
        {/* Badge */}
        <span
          className="inline-block self-start text-[10px] font-bold tracking-[0.18em] uppercase px-3 py-1 rounded-full mb-5 border"
          style={{
            color: `hsl(var(${accentVar}))`,
            borderColor: `hsl(var(${accentVar}) / 0.5)`,
            background: `hsl(var(${accentVar}) / 0.12)`,
          }}
        >
          {badge}
        </span>

        {/* Title */}
        <h2
          className="text-5xl sm:text-6xl font-bold text-white leading-none tracking-tight mb-4"
          style={{
            fontFamily: 'var(--font-heading)',
            textShadow: 'var(--arena-text-shadow)',
          }}
        >
          {title}
        </h2>

        {/* Tagline */}
        <p className="text-white/80 text-base sm:text-lg leading-relaxed mb-6 max-w-sm">
          {tagline}
        </p>

        {/* CTA row */}
        <span
          className="inline-flex items-center gap-2 text-sm font-semibold transition-all duration-200 group-hover:gap-3"
          style={{ color: `hsl(var(${accentVar}))` }}
        >
          Enter
          <span
            className="flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 group-hover:scale-110"
            style={{
              background: `hsl(var(${accentVar}))`,
              color: 'hsl(var(--background))',
            }}
          >
            <ArrowRight size={15} />
          </span>
        </span>
      </div>
    </motion.button>
  );
}
