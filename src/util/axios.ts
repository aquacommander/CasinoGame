import axios from "axios";
import { API_URL } from "@/config";

const axiosServices = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000, // 10 second default timeout
});

// Add request interceptor to handle errors gracefully
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
