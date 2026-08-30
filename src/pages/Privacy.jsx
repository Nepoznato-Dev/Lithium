import React from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../Components/Icon';


export default function Privacy() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <section className="glass max-w-lg p-8">
        <NavLink
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-white/45 transition-colors hover:text-white"
        >
          <Icon name="ArrowLeft" className="h-4 w-4" /> Back to Lithium
        </NavLink>
        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/15 text-cyan-300">
            <Icon name="ShieldCheck" className="h-5 w-5" />
          </span>
          <h1 className="text-2xl font-bold text-white">Privacy notice</h1>
        </div>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/55">
          <p>
            Lithium is local-first. Game favorites, music preferences, browser bookmarks, and
            calculator history are stored only in your browser&rsquo;s local storage.
          </p>
          <p>
            Nothing is uploaded, no analytics run, and there are no trackers. Embedded games and
            streaming services load directly from their own providers inside sandboxed frames.
          </p>
          <p>You can clear everything at any time from your browser&rsquo;s site-data settings.</p>
        </div>
      </section>
    </div>
  );
}
