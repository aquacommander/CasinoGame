import axios from "axios";
import { API_URL } from "@/config";

const axiosServices = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000, // 10 second default timeout
});

// Add request interceptor to include public key from wallet
axiosServices.interceptors.request.use(
  (config) => {
    // Get public key from localStorage wallet
    try {
      const walletStr = localStorage.getItem("wallet");
      if (walletStr) {
        const wallet = JSON.parse(walletStr);
        if (wallet?.publicKey) {
          // Add public key to request body if it's a POST/PUT/PATCH request
          if (config.method === 'post' || config.method === 'put' || config.method === 'patch') {
            if (config.data && typeof config.data === 'object') {
              config.data.publicKey = wallet.publicKey;
            } else {
              config.data = { ...config.data, publicKey: wallet.publicKey };
            }
          }
          // Add public key to query params for GET requests
          else if (config.method === 'get') {
            config.params = { ...config.params, publicKey: wallet.publicKey };
          }
        }
      }
    } catch (error) {
      // Silently fail if wallet not available
      console.debug('Could not add public key to request:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors gracefully
axiosServices.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't throw for network errors - let components handle them
    if (error.code === 'ERR_NETWORK' || error.message === 'Network Error') {
      // Return a structured error response
      return Promise.reject({
        ...error,
        isNetworkError: true,
        message: 'Network error - API may be unavailable',
      });
    }
    return Promise.reject(error);
  }
);

export default axiosServices;
