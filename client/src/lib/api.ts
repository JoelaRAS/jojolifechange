import axios from "axios";

const resolveBaseUrl = () => {
  if (typeof window !== "undefined") {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    }
    const { protocol, hostname, port } = window.location;
    const apiPort = port && port !== "" && port !== "3000" ? port : "4000";
    const url = `${protocol}//${hostname}:${apiPort}/api`;
    console.info("[LifeOS] API base URL", url);
    return url;
  }

  return "http://localhost:4000/api";
};

const api = axios.create({
  baseURL: resolveBaseUrl()
});

api.interceptors.request.use((config) => {
  const token = window.localStorage.getItem("lifeos-token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { api };
