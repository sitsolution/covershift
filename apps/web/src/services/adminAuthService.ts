import api from './api';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  userId: number;
  role: string;
  isVerified: boolean;
  fullName?: string;
}

export interface ForgotPasswordResponse {
  message: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  debugOtp?: string | null;
}

const adminAuthService = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  /** Emails a reset code. Fails with "No account found…" for an unknown email. */
  forgotPassword: async (email: string): Promise<ForgotPasswordResponse> => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (email: string, code: string, newPassword: string): Promise<void> => {
    await api.post('/auth/reset-password', { email, code, newPassword });
  },
};

export default adminAuthService;
