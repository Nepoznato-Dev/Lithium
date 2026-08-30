import React from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../Icon';

/** Consistent page header with back navigation, title, and subtitle.
 *  `standalone` hides the back arrow (used when running as a desktop window). */
export default function PageHeader({ title, subtitle, children, standalone = false }) {
  const navigate = useNavigate();

  const goBack = () => {
    if (window.history.state && window.history.state.idx > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <header className="animate-fade-up mb-6 flex flex-wrap items-center gap-4">
      {!standalone && (
        <button className="icon-btn border border-white/10 bg-white/5" onClick={goBack} aria-label="Go back">
          <Icon name="ArrowLeft" className="h-4 w-4" />
        </button>
      )}
      <div className="mr-auto">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-white/45">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
