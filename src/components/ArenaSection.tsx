/**
 * ArenaSection — homepage entry-point cards for Fan Arena and Parent Arena.
 *
 * The selected arena card always determines the destination, regardless of
 * the user's saved lastPortalPreference. The ?portal= hint is passed in all
 * cases so my-soccer.tsx can honour it even when the user is already there.
 *
 * Routing:
 *   Fan Arena   (signed in)  → /my-soccer?portal=fan
 *   Fan Arena   (signed out) → /login/auth?portal=fan
 *   Parent Arena (signed in) → /my-soccer?portal=parent  (my-soccer handles setup gate)
 *   Parent Arena (signed out)→ /login/auth?portal=parent
 */

import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useSession } from '@/lib/auth/auth-client';
import ArenaCard from '@/components/ArenaCard';

export default function ArenaSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useSession();

  function goFan() {
    navigate(isAuthenticated ? '/my-soccer?portal=fan' : '/login/auth?portal=fan');
  }

  function goParent() {
    navigate(isAuthenticated ? '/my-soccer?portal=parent' : '/login/auth?portal=parent');
  }

  return (
    <section className="py-xxl bg-background" aria-labelledby="arena-heading">
      <div className="max-w-7xl mx-auto px-6">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: 'easeOut' as const }}
          className="text-center mb-12"
        >
          <span
            className="text-xs font-semibold tracking-widest uppercase mb-4 block"
            style={{ color: 'hsl(var(--primary))' }}
          >
            Your personal soccer experience
          </span>
          <h2
            id="arena-heading"
            className="text-4xl md:text-5xl font-bold text-foreground mb-4 leading-tight"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Choose Your Arena
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto leading-relaxed">
            {isAuthenticated
              ? 'Jump back in — your personalized experience is waiting.'
              : 'Sign in to unlock your personalized soccer world.'}
          </p>
        </motion.div>

        {/* Cards — side by side on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-7">
          <ArenaCard
            badge="Fan Arena"
            title="Fan Arena"
            tagline="Your teams. Your sources. Your soccer world."
            imageSlot="/airo-assets/images/pages/home/arena-fan"
            accentVar="--primary"
            delay={0}
            onClick={goFan}
          />
          <ArenaCard
            badge="Parent Arena"
            title="Parent Arena"
            tagline="Your players. Your plans. Your soccer community."
            imageSlot="/airo-assets/images/pages/home/arena-parent"
            accentVar="--secondary"
            delay={0.1}
            onClick={goParent}
          />
        </div>

        {/* Sign-in nudge for unauthenticated visitors */}
        {!isAuthenticated && (
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="text-center text-sm text-muted-foreground mt-6"
          >
            Already have an account?{' '}
            <button
              type="button"
              onClick={goFan}
              className="font-semibold hover:underline"
              style={{ color: 'hsl(var(--primary))' }}
            >
              Sign in
            </button>
          </motion.p>
        )}
      </div>
    </section>
  );
}
