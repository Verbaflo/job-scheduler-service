import type { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import axiosRetry, { isNetworkOrIdempotentRequestError } from 'axios-retry';
import { RequestContext } from '../middlewares/request_context';
import { Logger } from './logger';

const instance: AxiosInstance = axios.create({
  timeout: 10000,
});

axiosRetry(instance, {
  retries: 3,
  retryCondition: (error) => {
    const status = error.response?.status ?? 0;
    if (isNetworkOrIdempotentRequestError(error)) return true;
    if (status === 429) return true;
    if (status >= 500 && status !== 501 && status !== 505) return true;
    return false;
  },
  retryDelay: (retryCount, error) => {
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds)) return seconds * 1000;
    }
    const base = Math.min(1000 * 2 ** (retryCount - 1), 8000);
    const jitter = Math.floor(Math.random() * 250);
    return base + jitter;
  },
  shouldResetTimeout: true,
  onRetry: (retryCount, error, requestConfig) => {
    Logger.info({
      message: 'HTTP retry',
      num_key1: 'retryCount',
      num_key1_value: retryCount,
      http_method: (requestConfig.method || 'get').toUpperCase(),
      url: (requestConfig.baseURL || '') + (requestConfig.url || ''),
      status_code: error.response?.status,
    });
  },
});

instance.interceptors.request.use((config) => {
  const rid = RequestContext.getRequestId();
  config.headers = config.headers || {};
  if ('set' in config.headers) {
    config.headers.set('content-type', 'application/json');
    if (rid) config.headers.set('x-request-id', rid);
  } else {
    (config.headers as any)['content-type'] = 'application/json';
    if (rid) (config.headers as any)['x-request-id'] = rid;
  }
  (config as any).__start = process.hrtime.bigint();
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    throw error;
  },
);

type Opts = Omit<AxiosRequestConfig, 'url' | 'method' | 'data'>;

const get = async <TRes>(url: string, opts?: Opts): Promise<TRes> => {
  const res = await instance.get<TRes>(url, opts);
  return res.data;
};

const post = async <TReq, TRes>(
  url: string,
  payload: TReq,
  opts?: Opts,
): Promise<TRes> => {
  const res = await instance.post<TRes>(url, payload, opts);
  return res.data;
};

const put = async <TReq, TRes>(
  url: string,
  payload: TReq,
  opts?: Opts,
): Promise<TRes> => {
  const res = await instance.put<TRes>(url, payload, opts);
  return res.data;
};

const patch = async <TReq, TRes>(
  url: string,
  payload: TReq,
  opts?: Opts,
): Promise<TRes> => {
  const res = await instance.patch<TRes>(url, payload, opts);
  return res.data;
};

const del = async <TRes>(url: string, opts?: Opts): Promise<TRes> => {
  const res = await instance.delete<TRes>(url, opts);
  return res.data;
};

export const HttpClient = {
  get,
  post,
  put,
  patch,
  delete: del,
};
