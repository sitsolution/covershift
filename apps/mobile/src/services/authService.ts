import api from './api';

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: number;
  role: string;
  isVerified: boolean;
  debugOtp?: string | null;
}

export interface RegisterData extends TokenData {
  otpSentTo: string;
  debugOtp?: string | null;
}

const authService = {
  login: async (email: string, password: string): Promise<TokenData> => {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  registerDoctor: async (form: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    licenseNumber: string;
    specialty: string;
    experience: string;
  }): Promise<RegisterData> => {
    const { data } = await api.post('/auth/register', {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: 'doctor',
      licenseNumber: form.licenseNumber,
      specialty: form.specialty,
      experience: form.experience,
      acceptedTerms: true,
    });
    return data;
  },

  registerNurse: async (form: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    regNumber: string;
    specialty: string;
    experience: string;
  }): Promise<RegisterData> => {
    const { data } = await api.post('/auth/register', {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: 'nurse',
      regNumber: form.regNumber,
      specialty: form.specialty,
      experience: form.experience,
      acceptedTerms: true,
    });
    return data;
  },

  registerOTTech: async (form: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    certNumber: string;
    certifyingBody: string;
    experience: string;
  }): Promise<RegisterData> => {
    const { data } = await api.post('/auth/register', {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: 'ot_tech',
      certNumber: form.certNumber,
      certifyingBody: form.certifyingBody,
      experience: form.experience,
      acceptedTerms: true,
    });
    return data;
  },

  registerHousekeeping: async (form: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    idProof: string;
    workArea: string;
  }): Promise<RegisterData> => {
    const { data } = await api.post('/auth/register', {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: 'housekeeping',
      idProof: form.idProof,
      workArea: form.workArea,
      acceptedTerms: true,
    });
    return data;
  },

  registerAdmin: async (form: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    facilityName: string;
    facilityType: string;
    city: string;
  }): Promise<RegisterData> => {
    const { data } = await api.post('/auth/register', {
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      password: form.password,
      role: 'facility_admin',
      facilityName: form.facilityName,
      facilityType: form.facilityType,
      city: form.city,
      acceptedTerms: true,
    });
    return data;
  },

  verifyOtp: async (email: string, code: string): Promise<TokenData> => {
    const { data } = await api.post('/auth/verify-otp', { email, code });
    return data;
  },

  resendOtp: async (email: string): Promise<void> => {
    await api.post('/auth/resend-otp', { email });
  },

  forgotPassword: async (
    email: string,
  ): Promise<{ resendAvailableInSeconds: number; debugOtp?: string | null }> => {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },

  resetPassword: async (email: string, code: string, newPassword: string): Promise<void> => {
    await api.post('/auth/reset-password', { email, code, newPassword });
  },

  changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  googleAuth: async (accessToken: string): Promise<TokenData | { needsRegistration: true; googleEmail: string; googleName: string }> => {
    const { data } = await api.post('/auth/google', { accessToken });
    return data;
  },

  googleSignup: async (form: {
    accessToken: string;
    role: string;
    phone?: string;
    licenseNumber?: string;
    regNumber?: string;
    certNumber?: string;
    idProof?: string;
    specialty?: string;
    certifyingBody?: string;
    workArea?: string;
    experience?: string;
    facilityName?: string;
    facilityType?: string;
    city?: string;
  }): Promise<TokenData> => {
    const { data } = await api.post('/auth/google-signup', form);
    return data;
  },
};

export default authService;
