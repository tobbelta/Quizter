/**
 * Enkel footer-komponent för applikationen.
 */
import React from 'react';
import { getVersionInfo } from '../../version';

const Footer = () => {
  const { VERSION, BUILD_DATE } = getVersionInfo();

  return (
    <footer className="bg-slate-950 text-center py-4 border-t border-slate-800">
      <p className="text-xs text-gray-500">
        Quizter Version {VERSION} (Build: {new Date(BUILD_DATE).toLocaleDateString('sv-SE')})
      </p>
    </footer>
  );
};

export default Footer;