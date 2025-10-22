/**
 * Enkel footer-komponent för applikationen.
 */
import React from 'react';
import { getVersionInfo } from '../../version';

const Footer = ({ className = '' }) => {
  const { VERSION, BUILD_DATE } = getVersionInfo();

  return (
    <footer
      className={`bg-slate-950 text-center border-t border-slate-800 px-4 py-4 ${className}`.trim()}
      style={{ paddingBottom: 'calc(1rem + var(--safe-area-inset-bottom, 0px))' }}
    >
      <p className="text-xs text-gray-500">
        Quizter Version {VERSION} (Build: {new Date(BUILD_DATE).toLocaleDateString('sv-SE')})
      </p>
    </footer>
  );
};

export default Footer;
