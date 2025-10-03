import React from 'react';
import Header from './Header';

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
}) => {
  return (
    <div className={`min-h-screen ${background}`}>
      {!disableHeader && <Header title={headerTitle} />}
      <main
        className={`mx-auto w-full ${maxWidth} px-4 sm:px-6 pt-[calc(5.75rem+env(safe-area-inset-top,0px))] pb-16 ${className}`.trim()}
      >
        {children}
      </main>
    </div>
  );
};

export default PageLayout;
