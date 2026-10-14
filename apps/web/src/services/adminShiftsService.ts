import api from './api';

export interface AdminShiftRow {
  id: number;
  reference: string;
  title?: string;
  startTime: string;
  endTime: string;
  location: string;
  specialty: string;
  role: string;
  status: string;
  displayStatus: string;
  assignedStaff: string[];
  applicantCount: number;
  payRate: number;
  isUrgent: boolean;
  slots: number;
  slotsFilled: number;
}

export interface AdminShiftListResponse {
  items: AdminShiftRow[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ApplicantRow {
  applicationId: number;
  staffId: number;
  name: string;
  initials: string;
  specialty?: string;
  rating: number;
  reviewsCount: number;
  shiftsCompleted: number;
  isVerified: boolean;
  appliedAt: string;
  status: string;
}

export interface TimelineEntry {
  label: string;
  at?: string;
  done: boolean;
}

export interface AdminShiftDetail extends AdminShiftRow {
  title?: string;
  shiftType?: string;
  facilityId: number;
  facilityName: string;
  durationHours: number;
  overtimeRate?: number;
  requirements?: string;
  requiredQualifications: string[];
  requiredCertifications: string[];
  amenities: string[];
  description?: string;
  isVisible: boolean;
  tags: string[];
  applicants: ApplicantRow[];
  timeline: TimelineEntry[];
  createdAt: string;
  publishedAt?: string;
}

export interface ShiftFormOptions {
  facilities: Array<{ id: number; name: string; location: string }>;
  specialties: string[];
  qualifications: string[];
  certifications: string[];
  shiftTypes: string[];
}

export interface ShiftFilters {
  search?: string;
  status?: string;
  location?: string;
  specialty?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

const adminShiftsService = {
  listShifts: async (filters: ShiftFilters = {}): Promise<AdminShiftListResponse> => {
    const { data } = await api.get('/admin/shifts', { params: filters });
    return data;
  },

  getFormOptions: async (): Promise<ShiftFormOptions> => {
    const { data } = await api.get('/admin/shifts/form-options');
    return data;
  },

  getShift: async (id: number): Promise<AdminShiftDetail> => {
    const { data } = await api.get(`/admin/shifts/${id}`);
    return data;
  },

  createShift: async (payload: Record<string, unknown>): Promise<AdminShiftDetail> => {
    const { data } = await api.post('/admin/shifts', payload);
    return data;
  },

  updateShift: async (id: number, payload: Record<string, unknown>): Promise<AdminShiftDetail> => {
    const { data } = await api.patch(`/admin/shifts/${id}`, payload);
    return data;
  },

  publishShift: async (id: number): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${id}/publish`);
    return data;
  },

  duplicateShift: async (id: number): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${id}/duplicate`);
    return data;
  },

  assignApplicant: async (shiftId: number, applicationId: number): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${shiftId}/assign`, { applicationId });
    return data;
  },

  rejectApplicant: async (shiftId: number, applicationId: number, reason?: string): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${shiftId}/applicants/${applicationId}/reject`, { reason });
    return data;
  },

  cancelShift: async (id: number, reason?: string): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${id}/cancel`, { reason });
    return data;
  },

  completeShift: async (id: number): Promise<AdminShiftDetail> => {
    const { data } = await api.post(`/admin/shifts/${id}/complete`);
    return data;
  },

  deleteShift: async (id: number): Promise<void> => {
    await api.delete(`/admin/shifts/${id}`);
  },
};

export default adminShiftsService;
