import React from 'react';
import Header from './Header';
import Footer from './Footer';

/**
 * PageLayout ger en konsekvent toppmarginal (under den fasta headern)
 * och centrerar innehållet med responsiva sidmarginaler.
 */
const PageLayout = ({
  children,
  headerTitle,
  maxWidth = 'max-w-4xl',
  background = 'bg-slate-950',
  className = '',
  disableHeader = false,
  disableFooter = false,
}) => {
  return (
    <div className={`min-h-screen ${background}`}>
      {!disableHeader && <Header title={headerTitle} />}
      <div className="flex min-h-[var(--app-viewport-100, 100vh)] flex-col">
        <main
          className={`mx-auto w-full flex-1 ${maxWidth} px-4 sm:px-6 pt-[calc(5.75rem+var(--safe-area-inset-top,0px))] pb-[calc(4rem+var(--safe-area-inset-bottom,0px))] ${className}`.trim()}
          style={{ paddingTop: 'calc(var(--app-header-height, 5.75rem) + 1rem)' }}
        >
          {children}
        </main>
        {!disableFooter && <Footer className="mt-auto" />}
      </div>
    </div>
  );
};

export default PageLayout;
