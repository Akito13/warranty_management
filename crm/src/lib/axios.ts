import axios, { AxiosInstance } from 'axios';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined') {
    if (window.location.hostname.includes('warranty.com')) {
      return `${window.location.origin}/api`;
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';
};

const API_BASE_URL = getApiBaseUrl();

export const axiosClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

function unwrapResponse<T>(resData: unknown): T {
  if (resData && typeof resData === 'object') {
    if ('data' in resData && 'success' in resData) {
      return (resData as { data: T }).data;
    }
  }
  return resData as T;
}

export const api = {
  async get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const res = await axiosClient.get(url, { params });
    return unwrapResponse<T>(res.data);
  },

  async post<T, B = unknown>(url: string, data?: B): Promise<T> {
    const res = await axiosClient.post(url, data);
    return unwrapResponse<T>(res.data);
  },

  async patch<T, B = unknown>(url: string, data?: B): Promise<T> {
    const res = await axiosClient.patch(url, data);
    return unwrapResponse<T>(res.data);
  },

  async delete<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    const res = await axiosClient.delete(url, { params });
    return unwrapResponse<T>(res.data);
  },
};
