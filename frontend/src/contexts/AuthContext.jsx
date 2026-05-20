import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    try { return JSON.parse(localStorage.getItem('alfalca_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('alfalca_token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then(r => setUser(r.data.data))
      .catch(() => { localStorage.removeItem('alfalca_token'); localStorage.removeItem('alfalca_user'); setUser(null); })
      .finally(() => setLoading(false));
  }, []);

  function login(token, userData) {
    localStorage.setItem('alfalca_token', token);
    localStorage.setItem('alfalca_user', JSON.stringify(userData));
    setUser(userData);
  }

  function logout() {
    localStorage.removeItem('alfalca_token');
    localStorage.removeItem('alfalca_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() { return useContext(AuthContext); }
