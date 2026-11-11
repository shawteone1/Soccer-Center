import { Helmet } from '@dr.pogodin/react-helmet';
import { type ReactElement } from 'react';
import { ScrollRestoration } from 'react-router';

import HomepageSameAsJsonLd from '@/components/HomepageSameAsJsonLd';
import Footer from '@/layouts/parts/Footer';
import Header from '@/layouts/parts/Header';
import Website from '@/layouts/Website';
import { LayoutProvider, useLayoutContext } from '@/layouts/LayoutContext';

/**
 * Root layout component that wraps all pages with consistent header and footer.
 *
 * Portal and Fan layouts set suppressPublicChrome=true via SuppressPublicChrome
 * so the public Header/Footer are hidden when inside those shells.
 *
 * To customize the header or footer, directly edit the Header.tsx and Footer.tsx
 * files in the layouts/parts directory.
 *
 * Site-wide <title> and <meta> live in the <Helmet> below. Individual pages can
 * override them by rendering their own <Helmet> — last-mounted wins.
 */
interface RootLayoutProps {
  children: ReactElement;
}

function RootLayoutInner({ children }: RootLayoutProps) {
  const { suppressPublicChrome } = useLayoutContext();

  if (suppressPublicChrome) {
    // Portal/Fan layouts render their own chrome — skip public Header/Footer
    return (
      <Website>
        <Helmet>
          <title>Soccer Center Colorado — Clubs, Leagues, Training &amp; Community</title>
          <meta
            name="description"
            content="Your home for soccer. Find youth clubs, adult leagues, training programs, facilities, and fan communities across Denver, Colorado Springs, Boulder, and beyond."
          />
        </Helmet>
        <HomepageSameAsJsonLd />
        <ScrollRestoration />
        {children}
      </Website>
    );
  }

  return (
    <Website>
      <Helmet>
        <title>Soccer Center Colorado — Clubs, Leagues, Training &amp; Community</title>
        <meta
          name="description"
          content="Your home for soccer. Find youth clubs, adult leagues, training programs, facilities, and fan communities across Denver, Colorado Springs, Boulder, and beyond."
        />
      </Helmet>
      <HomepageSameAsJsonLd />
      <ScrollRestoration />
      <Header />
      {children}
      <Footer />
    </Website>
  );
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <LayoutProvider>
      <RootLayoutInner>{children}</RootLayoutInner>
    </LayoutProvider>
  );
}
