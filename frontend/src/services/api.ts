import axios from 'axios';
import {
  AuthResponse,
  UserDto,
  PaymentImageDto,
  BankStatementDto,
  ReconciliationReportDto,
  ReportDetailDto,
  ReconciliationMatchDto
} from '../shared/types';

// Set up the API URL pointing to the Node Express server
const API_URL = import.meta.env.VITE_API_URL || 'https://payment-reconciliation-production.up.railway.app/';

const apiClient = axios.create({
  baseURL: API_URL,
});

// Request interceptor to automatically attach authorization Bearer tokens
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Response interceptor to handle global authorization failures
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // If we are not on the login page, redirect to login
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);

export const api = {
  // Auth Endpoint
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const res = await apiClient.post<AuthResponse>('/api/auth/login', { email, password });
      return res.data;
    },
    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    },
    getCurrentUser: (): UserDto | null => {
      const userStr = localStorage.getItem('user');
      if (!userStr) return null;
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
  },

  // Payment Screenshots
  payments: {
    upload: async (files: File[]): Promise<{ uploaded: PaymentImageDto[]; failed: any[] }> => {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      const res = await apiClient.post('/api/payments/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    list: async (): Promise<PaymentImageDto[]> => {
      const res = await apiClient.get<PaymentImageDto[]>('/api/payments');
      return res.data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const res = await apiClient.delete<{ message: string }>(`/api/payments/${id}`);
      return res.data;
    }
  },

  // Bank Statements
  statements: {
    upload: async (file: File): Promise<{ statement: BankStatementDto; count: number }> => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiClient.post('/api/statements/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return res.data;
    },
    list: async (): Promise<BankStatementDto[]> => {
      const res = await apiClient.get<BankStatementDto[]>('/api/statements');
      return res.data;
    },
    delete: async (id: string): Promise<{ message: string }> => {
      const res = await apiClient.delete<{ message: string }>(`/api/statements/${id}`);
      return res.data;
    }
  },

  // Reconciliation Runs & Reports
  reconciliation: {
    run: async (name?: string): Promise<ReconciliationReportDto> => {
      const res = await apiClient.post<ReconciliationReportDto>('/api/reconciliation/run', { name });
      return res.data;
    },
    listReports: async (): Promise<ReconciliationReportDto[]> => {
      const res = await apiClient.get<ReconciliationReportDto[]>('/api/reconciliation/reports');
      return res.data;
    },
    getReport: async (id: string): Promise<ReportDetailDto> => {
      const res = await apiClient.get<ReportDetailDto>(`/api/reconciliation/reports/${id}`);
      return res.data;
    },
    deleteReport: async (id: string): Promise<{ message: string }> => {
      const res = await apiClient.delete<{ message: string }>(`/api/reconciliation/reports/${id}`);
      return res.data;
    },
    manualMatch: async (matchId: string, statementTransactionId: string): Promise<ReconciliationMatchDto> => {
      const res = await apiClient.post<ReconciliationMatchDto>(`/api/reconciliation/matches/${matchId}/manual`, { statementTransactionId });
      return res.data;
    },
    rejectMatch: async (matchId: string): Promise<ReconciliationMatchDto> => {
      const res = await apiClient.post<ReconciliationMatchDto>(`/api/reconciliation/matches/${matchId}/reject`);
      return res.data;
    }
  }
};
