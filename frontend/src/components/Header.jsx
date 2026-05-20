import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [ddOpen, setDdOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="h-14 bg-white border-b border-ahg-accent/30 flex items-center px-4 gap-4 sticky top-0 z-10">
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-1.5 rounded-lg hover:bg-ahg-accent/20 text-ahg-primary"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Usuario */}
      <div className="relative">
        <button
          onClick={() => setDdOpen(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-ahg-accent/20 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-ahg-primary flex items-center justify-center text-white text-xs font-bold">
            {user?.nombre?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-sm font-medium text-ahg-text leading-tight">{user?.nombre}</p>
            <p className="text-xs text-ahg-text/50 capitalize">{user?.rol}</p>
          </div>
          <svg className="w-4 h-4 text-ahg-text/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {ddOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDdOpen(false)} />
            <div className="absolute right-0 mt-1 w-44 bg-white border border-ahg-accent/30 rounded-xl shadow-lg z-20 overflow-hidden">
              <div className="px-3 py-2 border-b border-ahg-accent/20">
                <p className="text-xs text-ahg-text/50">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
