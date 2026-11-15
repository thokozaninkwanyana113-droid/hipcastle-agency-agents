import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  const handle = ({ token, user }) => { setToken(token); setUser(user); return user; };
  const value = {
    user, ready, setUser,
    isStaff: user?.role === 'admin' || user?.role === 'staff',
    login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(handle),
    register: (data) => api('/auth/register', { method: 'POST', body: data }).then(handle),
    logout: () => { setToken(null); setUser(null); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
