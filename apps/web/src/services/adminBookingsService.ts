import api from './api';

export interface BookingRow {
  id: number;
  reference: string;
  shiftId: number;
  shiftLabel: string;
  shiftStart: string;
  shiftEnd: string;
  staffId: number;
  staffName: string;
  staffInitials: string;
  staffEmail: string;
  bookedOn: string;
  status: string;
  displayStatus: string;
}

export interface BookingMessageOut {
  id: number;
  authorName: string;
  authorSide: 'staff' | 'facility';
  body: string;
  createdAt: string;
}

export interface TimelineEntry {
  label: string;
  at?: string;
  done: boolean;
}

export interface BookingDetail extends BookingRow {
  facilityName: string;
  specialty: string;
  shiftRole: string;
  payRate: number;
  durationHours: number;
  staffEmail: string;
  staffPhone?: string;
  staffRating: number;
  staffSpecialty?: string;
  timeline: TimelineEntry[];
  messages: BookingMessageOut[];
  paymentId?: number;
  paymentStatus?: string;
}

export interface BookingListResponse {
  items: BookingRow[];
  total: number;
  counts: Record<string, number>;
  limit: number;
  offset: number;
  hasMore: boolean;
}

const adminBookingsService = {
  listBookings: async (tab = 'all', search?: string, limit = 25, offset = 0, sortBy?: string, sortOrder?: string): Promise<BookingListResponse> => {
    const { data } = await api.get('/admin/bookings', {
      params: { tab, search, limit, offset, sortBy, sortOrder },
    });
    return data;
  },

  getBooking: async (id: number): Promise<BookingDetail> => {
    const { data } = await api.get(`/admin/bookings/${id}`);
    return data;
  },

  sendMessage: async (id: number, body: string): Promise<BookingMessageOut> => {
    const { data } = await api.post(`/admin/bookings/${id}/messages`, { body });
    return data;
  },

  /** Confirms a pending booking onto its shift — same as Assign on Shift Details. */
  acceptBooking: async (id: number): Promise<BookingDetail> => {
    const { data } = await api.post(`/admin/bookings/${id}/accept`);
    return data;
  },

  completeBooking: async (id: number): Promise<BookingDetail> => {
    const { data } = await api.post(`/admin/bookings/${id}/complete`);
    return data;
  },

  cancelBooking: async (id: number, reason?: string): Promise<BookingDetail> => {
    const { data } = await api.post(`/admin/bookings/${id}/cancel`, { reason });
    return data;
  },

  markPaymentDone: async (id: number): Promise<BookingDetail> => {
    const { data } = await api.post(`/admin/bookings/${id}/payment-done`);
    return data;
  },

  exportCsv: async (tab = 'all') => {
    const { data } = await api.get('/admin/bookings/export', {
      params: { tab },
      responseType: 'blob',
    });
    const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

export default adminBookingsService;
