// src/renderer/components/ModalPortal.tsx - Full-Viewport Portal Wrapper for Modal Overlays
import React from 'react';
import { createPortal } from 'react-dom';

interface ModalPortalProps {
  children: React.ReactNode;
}

/**
 * Renders modal overlays directly into document.body so they always cover the
 * entire viewport (including top navbar and sidebar) without being offset by
 * parent Tailwind `space-y-*` / `space-x-*` utilities or trapped inside local
 * overflow/z-index stacking contexts.
 */
export const ModalPortal: React.FC<ModalPortalProps> = ({ children }) => {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
};
