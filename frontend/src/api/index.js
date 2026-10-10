import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('alfalca_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('alfalca_token');
      localStorage.removeItem('alfalca_user');
      // Vuelve a la misma pantalla después de entrar: es lo que pasa al tocar un aviso
      // con la sesión vencida.
      const aca = window.location.pathname + window.location.search;
      if (window.location.pathname !== '/login') {
        window.location.href = aca && aca !== '/' ? `/login?volver=${encodeURIComponent(aca)}` : '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
