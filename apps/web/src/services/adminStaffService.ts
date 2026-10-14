import api from './api';

export interface StaffRow {
  id: number;
  name: string;
  initials: string;
  role: string;
  roleLabel: string;
  specialty?: string;
  location?: string;
  isAvailable: boolean;
  availabilityLabel: string;
  rating: number;
  verificationStatus: string;
  shiftsCompleted: number;
}

export interface StaffListResponse {
  items: StaffRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface StaffStats {
  shiftsCompleted: number;
  shiftsAtThisFacility: number;
  completionRate: number;
  rating: number;
  reviewsCount: number;
  cancellationCount: number;
  totalPaid: number;
  avgResponseMinutes: number | null;
}

export interface StaffDetail {
  id: number;
  name: string;
  initials: string;
  email: string;
  phone?: string;
  role: string;
  roleLabel: string;
  avatarUrl?: string;
  isVerified: boolean;
  isAvailable: boolean;
  joinedOn: string;
  credentialLabel: string;
  credentialNumber?: string;
  specialty?: string;
  experience?: string;
  qualifications?: string;
  preferredLocations: string[];
  minPayRate?: number;
  stats: StaffStats;
  canViewDocuments: boolean;
  documents: unknown[];
}

export interface StaffShiftHistoryRow {
  shiftId: number;
  reference: string;
  facilityName: string;
  specialty: string;
  startTime: string;
  endTime: string;
  status: string;
  payRate: number;
  ratingGiven?: number;
}

export interface StaffReviewOut {
  id: number;
  rating: number;
  comment?: string;
  facilityName?: string;
  authorName?: string;
  shiftReference?: string;
  createdAt: string;
}

export interface StaffNoteOut {
  id: number;
  body: string;
  authorName?: string;
  createdAt: string;
}

export interface StaffFilterOptions {
  roles: Array<{ value: string; label: string }>;
  specialties: string[];
  locations: string[];
}

export interface StaffFilters {
  search?: string;
  role?: string;
  availability?: string;
  verification?: string;
  minRating?: number;
  location?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const adminStaffService = {
  listStaff: async (filters: StaffFilters = {}): Promise<StaffListResponse> => {
    const { data } = await api.get('/admin/staff', { params: filters });
    return data;
  },

  getFilterOptions: async (): Promise<StaffFilterOptions> => {
    const { data } = await api.get('/admin/staff/filter-options');
    return data;
  },

  getStaff: async (id: number): Promise<StaffDetail> => {
    const { data } = await api.get(`/admin/staff/${id}`);
    return data;
  },

  getShiftHistory: async (id: number, limit = 50): Promise<StaffShiftHistoryRow[]> => {
    const { data } = await api.get(`/admin/staff/${id}/shifts`, { params: { limit } });
    return data;
  },

  getReviews: async (id: number): Promise<StaffReviewOut[]> => {
    const { data } = await api.get(`/admin/staff/${id}/reviews`);
    return data;
  },

  createReview: async (id: number, payload: { rating: number; comment?: string; shiftId?: number }): Promise<StaffReviewOut> => {
    const { data } = await api.post(`/admin/staff/${id}/reviews`, payload);
    return data;
  },

  getNotes: async (id: number): Promise<StaffNoteOut[]> => {
    const { data } = await api.get(`/admin/staff/${id}/notes`);
    return data;
  },

  createNote: async (id: number, body: string): Promise<StaffNoteOut> => {
    const { data } = await api.post(`/admin/staff/${id}/notes`, { body });
    return data;
  },

  deleteNote: async (staffId: number, noteId: number): Promise<void> => {
    await api.delete(`/admin/staff/${staffId}/notes/${noteId}`);
  },

  inviteStaff: async (payload: { fullName: string; email: string; phone?: string; role: string; specialty?: string }): Promise<void> => {
    await api.post('/admin/staff/invite', payload);
  },

  createStaff: async (payload: {
    fullName: string;
    email: string;
    phone: string;
    role: string;
    password: string;
    credentialNumber?: string;
    specialty?: string;
    experience?: string;
  }): Promise<{ id: number; name: string; email: string; role: string; roleLabel: string; isVerified: boolean }> => {
    const { data } = await api.post('/admin/staff', payload);
    return data;
  },
};

export default adminStaffService;
