/**
 * ArenaChooserModal
 *
 * Full-screen overlay shown to:
 *   1. First-time users (fanOnboardingDone = false) — initial arena selection.
 *   2. Users who click "Switch arena" in the My Soccer header.
 *
 * Uses the same ArenaCard component as the homepage so imagery, typography,
 * overlays, and Enter buttons are pixel-identical.
 *
 * Access rules (enforced server-side; this is UI-only):
 *   - Fan card  → always allowed; calls onSelectFan()
 *   - Parent card → calls onSelectParent(); caller shows setup gate if FAN account
 */

import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ArenaCard from '@/components/ArenaCard';

interface ArenaChooserModalProps {
  /** Whether the modal is visible */
  open: boolean;
  /** Called when the user picks Fan Arena */
  onSelectFan: () => void;
  /** Called when the user picks Parent Arena */
  onSelectParent: () => void;
  /** Called when the user dismisses without choosing (only shown for returning users) */
  onDismiss?: () => void;
  /** If true, show a dismiss (×) button — for "Switch arena" re-opens */
  dismissible?: boolean;
}

export default function ArenaChooserModal({
  open,
  onSelectFan,
  onSelectParent,
  onDismiss,
  dismissible = false,
}: ArenaChooserModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="arena-chooser"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
          style={{ background: 'hsl(var(--arena-overlay-dark, 215 28% 8%))' }}
          role="dialog"
          aria-modal="true"
          aria-label="Choose your arena"
        >
          {/* Top bar — safe area + dismiss */}
          <div className="flex items-center justify-between px-5 pt-6 pb-2 shrink-0">
            {/* Logo / wordmark */}
            <img
              src="/airo-assets/images/logo/horizontal"
              alt="Soccer Center"
              className="h-8 w-auto object-contain"
              loading="eager"
            />
            {dismissible && onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                aria-label="Close arena chooser"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Heading */}
          <div className="text-center px-6 pt-6 pb-8 shrink-0">
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' as const }}
              className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Choose Your Arena
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.22 }}
              className="mt-3 text-white/70 text-base sm:text-lg max-w-md mx-auto"
            >
              Your personalized soccer experience starts here.
            </motion.p>
          </div>

          {/* Cards */}
          <div className="flex-1 flex items-start justify-center px-5 pb-10">
            <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-7">
              <ArenaCard
                badge="Fan Arena"
                title="Fan Arena"
                tagline="Your teams. Your sources. Your soccer world."
                imageSlot="/airo-assets/images/pages/home/arena-fan"
                accentVar="--primary"
                delay={0.15}
                minHeight={380}
                onClick={onSelectFan}
              />
              <ArenaCard
                badge="Parent Arena"
                title="Parent Arena"
                tagline="Your players. Your plans. Your soccer community."
                imageSlot="/airo-assets/images/pages/home/arena-parent"
                accentVar="--secondary"
                delay={0.25}
                minHeight={380}
                onClick={onSelectParent}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
