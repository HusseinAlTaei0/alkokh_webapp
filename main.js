/* =============================================
   ALKOKH VET CLINIC — MAIN APPLICATION
   Grooming & Bathing Management System
   with Supabase Authentication & Database
   ============================================= */

// ==========================================
// AUTH MODULE
// ==========================================
const Auth = {
  _user: null,

  async init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    this._user = session?.user || null;
    this._updateUI();

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      this._user = session?.user || null;
      this._updateUI();
    });
  },

  async login(email, password) {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    this._user = data.user;
    this._updateUI();
    return data;
  },

  async logout() {
    await supabaseClient.auth.signOut();
    this._user = null;
    this._updateUI();
  },

  isAuthenticated() {
    return !!this._user;
  },

  getUser() {
    return this._user;
  },

  _updateUI() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.style.display = this._user ? 'flex' : 'none';
    }

    // Update lock icons in menu
    const locks = document.querySelectorAll('.menu-lock');
    locks.forEach(lock => {
      lock.style.display = this._user ? 'none' : 'inline';
    });
  }
};


// ==========================================
// DATABASE LAYER (Supabase)
// ==========================================
const DB = {
  // Cache for services and employees (they rarely change)
  _servicesCache: null,
  _employeesCache: null,

  // --- Services ---
  async getServices() {
    if (this._servicesCache) return this._servicesCache;
    try {
      const { data, error } = await supabaseClient
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('id');
      if (error) throw error;
      this._servicesCache = data || [];
      return this._servicesCache;
    } catch (err) {
      console.error('Error fetching services:', err);
      // Fallback to hardcoded if DB not ready
      return this._fallbackServices();
    }
  },

  _fallbackServices() {
    return [
      { id: 's1', category: 'cat_grooming', type_ar: 'نمرة خفيفة', type_en: 'Light Grade', icon: 'assets/alkokh_icons/haircut.png', duration_minutes: 30 },
      { id: 's2', category: 'cat_grooming', type_ar: 'شورت هير', type_en: 'Short Hair', icon: 'assets/alkokh_icons/haircut.png', duration_minutes: 25 },
      { id: 's3', category: 'dog_grooming', type_ar: 'نمرة 1', type_en: 'Grade 1', icon: 'assets/alkokh_icons/haircut.png', duration_minutes: 40 },
      { id: 's4', category: 'dog_grooming', type_ar: 'شورت هير', type_en: 'Short Hair', icon: 'assets/alkokh_icons/haircut.png', duration_minutes: 35 },
      { id: 's5', category: 'dog_grooming', type_ar: 'قصة مميزة', type_en: 'Special Cut', icon: 'assets/alkokh_icons/special_haircut.png', duration_minutes: 50 },
      { id: 's6', category: 'bath', type_ar: 'تحميم اعتيادي', type_en: 'Regular Bath', icon: 'assets/alkokh_icons/bath.png', duration_minutes: 20 },
      { id: 's7', category: 'bath', type_ar: 'تحميم طبي', type_en: 'Medical Bath', icon: 'assets/alkokh_icons/medical_bath.png', duration_minutes: 30 },
    ];
  },

  // --- Employees ---
  async getEmployees() {
    if (this._employeesCache) return this._employeesCache;
    try {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('id');
      if (error) throw error;
      this._employeesCache = data || [];
      return this._employeesCache;
    } catch (err) {
      console.error('Error fetching employees:', err);
      return this._fallbackEmployees();
    }
  },

  _fallbackEmployees() {
    return [
      { id: 'e1', name_ar: 'عباس', name_en: 'Abbas', specialization: 'bather', avatar_color: '#3B82F6', is_active: true },
      { id: 'e2', name_ar: 'أنور', name_en: 'Anwar', specialization: 'bather', avatar_color: '#10B981', is_active: true },
      { id: 'e3', name_ar: 'سهيل', name_en: 'Suheil', specialization: 'groomer', avatar_color: '#F59E0B', is_active: true },
      { id: 'e4', name_ar: 'قاسم', name_en: 'Qasim', specialization: 'groomer', avatar_color: '#EF4444', is_active: true },
    ];
  },

  // --- Orders ---
  async getOrders() {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching orders:', err);
      return [];
    }
  },

  async addOrder(order) {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .insert({
          customer_name: order.customer_name,
          customer_phone: order.customer_phone || null,
          pet_name: order.pet_name,
          pet_type: order.pet_type,
          service_id: order.service_id,
          notes: order.notes || '',
          status: 'waiting'
        })
        .select('id')
        .single();

      if (error) throw error;

      // Upsert customer record for history tracking
      try {
        await supabaseClient.rpc('upsert_customer', {
          p_name: order.customer_name,
          p_phone: order.customer_phone || null
        });
      } catch (e) {
        // Non-critical, don't block the order
        console.warn('Customer upsert failed:', e);
      }

      return data?.id || true;
    } catch (err) {
      console.error('Error adding order:', err);
      throw err;
    }
  },

  async updateOrder(id, updates) {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error updating order:', err);
      return null;
    }
  },

  async assignOrder(orderId, employeeId) {
    const now = new Date().toISOString();
    return this.updateOrder(orderId, {
      employee_id: employeeId,
      status: 'assigned',
      assigned_at: now
    });
  },

  async completeOrder(orderId) {
    try {
      // Get the order first to calculate duration
      const { data: order } = await supabaseClient
        .from('orders')
        .select('started_at')
        .eq('id', orderId)
        .single();

      if (!order) return null;
      const startedAt = new Date(order.started_at);
      const now = new Date();
      const duration = Math.round((now - startedAt) / 60000);

      return this.updateOrder(orderId, {
        status: 'completed',
        completed_at: now.toISOString(),
        duration_actual: duration
      });
    } catch (err) {
      console.error('Error completing order:', err);
      return null;
    }
  },

  async cancelOrder(orderId) {
    return this.updateOrder(orderId, {
      status: 'cancelled',
      completed_at: new Date().toISOString()
    });
  },

  async deleteOrder(orderId) {
    try {
      const { data, error } = await supabaseClient
        .from('orders')
        .delete()
        .eq('id', orderId)
        .select();
      if (error) throw error;
      
      if (!data || data.length === 0) {
        console.warn('Delete operation returned 0 rows. RLS or missing ID issue.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('Error deleting order:', err);
      return false;
    }
  },

  async deleteAllOrders() {
    try {
      // Deleting all orders. RLS policies allow this for authenticated admins.
      const { data, error } = await supabaseClient
        .from('orders')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Dummy condition to delete all
        .select();
      if (error) throw error;
      
      console.log('Deleted rows:', data?.length);
      return true;
    } catch (err) {
      console.error('Error deleting all orders:', err);
      return false;
    }
  },

  // --- Notification Logs ---
  async getNotificationStats() {
    try {
      const { data, error } = await supabaseClient
        .from('notification_logs')
        .select('status');
      if (error) throw error;
      const stats = { success: 0, failed: 0, pending: 0 };
      (data || []).forEach(r => {
        if (stats[r.status] !== undefined) stats[r.status]++;
      });
      return stats;
    } catch (err) {
      console.error('getNotificationStats error:', err);
      return { success: 0, failed: 0, pending: 0 };
    }
  },

  async getRecentNotificationLogs(limit = 20, filter = 'all') {
    try {
      let q = supabaseClient
        .from('notification_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (filter && filter !== 'all') q = q.eq('status', filter);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('getRecentNotificationLogs error:', err);
      return [];
    }
  },

  async resendNotification(logId) {
    try {
      // Fetch original log
      const { data: log, error: fetchErr } = await supabaseClient
        .from('notification_logs')
        .select('*')
        .eq('id', logId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!log) return false;

      // Invoke edge function with a fresh log row (not reusing old one)
      const { data, error } = await supabaseClient.functions.invoke('send-whatsapp', {
        body: {
          order_id: log.order_id,
          event_type: log.event_type,
          phone: log.phone,
          customer_name: log.customer_name,
          pet_name: log.pet_name,
          service_name: log.service_name
        }
      });
      if (error) throw error;
      return data?.success === true;
    } catch (err) {
      console.error('resendNotification error:', err);
      return false;
    }
  },

  // --- Employee System ---
  async employeeLogin(pin) {
    try {
      const { data, error } = await supabaseClient.rpc('employee_login', { p_pin: pin });
      if (error) throw error;
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.error('Employee login error:', err);
      return null;
    }
  },

  async getEmployeeOrders(employeeId) {
    try {
      const { data, error } = await supabaseClient.rpc('get_employee_orders', { p_employee_id: employeeId });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching employee orders:', err);
      return [];
    }
  },

  async getEmployeeCompleted(employeeId) {
    try {
      const { data, error } = await supabaseClient.rpc('get_employee_completed', { p_employee_id: employeeId });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching employee completed:', err);
      return [];
    }
  },

  async acceptOrder(orderId, employeeId) {
    try {
      const { error } = await supabaseClient.rpc('accept_order', {
        p_order_id: orderId,
        p_employee_id: employeeId
      });
      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error accepting order:', err);
      return false;
    }
  },

  async completeOrderEmployee(orderId, employeeId) {
    try {
      const { data, error } = await supabaseClient.rpc('complete_order_employee', {
        p_order_id: orderId,
        p_employee_id: employeeId
      });
      if (error) throw error;
      return data; // returns duration in minutes
    } catch (err) {
      console.error('Error completing order:', err);
      return null;
    }
  },

  async reassignOrder(orderId, newEmployeeId) {
    return this.updateOrder(orderId, {
      employee_id: newEmployeeId,
      status: 'assigned',
      assigned_at: new Date().toISOString(),
      started_at: null
    });
  },

  // --- Waiting count (for anonymous booking confirmation) ---
  async getWaitingCount() {
    try {
      const { data, error } = await supabaseClient.rpc('get_waiting_count');
      if (error) throw error;
      return data || 0;
    } catch (err) {
      console.warn('Could not get waiting count:', err);
      return 0;
    }
  },

  // --- Stats (requires auth) ---
  async getStats(period = 'all') {
    let orders = await this.getOrders();
    orders = orders.filter(o => o.status === 'completed');
    const now = new Date();

    if (period === 'today') {
      orders = orders.filter(o => {
        const d = new Date(o.completed_at);
        return d.toDateString() === now.toDateString();
      });
    } else if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      orders = orders.filter(o => new Date(o.completed_at) >= weekAgo);
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      orders = orders.filter(o => new Date(o.completed_at) >= monthAgo);
    }

    const services = await this.getServices();
    const employees = await this.getEmployees();

    const groomingCount = orders.filter(o => {
      const svc = services.find(s => s.id === o.service_id);
      return svc && (svc.category === 'cat_grooming' || svc.category === 'dog_grooming');
    }).length;

    const bathCount = orders.filter(o => {
      const svc = services.find(s => s.id === o.service_id);
      return svc && svc.category === 'bath';
    }).length;

    const employeeStats = employees.map(emp => {
      const empOrders = orders.filter(o => o.employee_id === emp.id);
      const avgDuration = empOrders.length > 0
        ? Math.round(empOrders.reduce((sum, o) => sum + (o.duration_actual || 0), 0) / empOrders.length)
        : 0;
      return {
        ...emp,
        count: empOrders.length,
        avgDuration
      };
    }).sort((a, b) => b.count - a.count);

    const uniqueCustomers = new Set(orders.map(o => o.customer_name)).size;
    const avgDuration = orders.length > 0
      ? Math.round(orders.reduce((sum, o) => sum + (o.duration_actual || 0), 0) / orders.length)
      : 0;

    return {
      total: orders.length,
      grooming: groomingCount,
      bath: bathCount,
      uniqueCustomers,
      avgDuration,
      employeeStats,
      orders
    };
  },

  // --- Weekly data for charts ---
  async getWeeklyData() {
    const allOrders = await this.getOrders();
    const orders = allOrders.filter(o => o.status === 'completed');
    const services = await this.getServices();
    const now = new Date();
    const labels = [];
    const groomingData = [];
    const bathData = [];

    const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      labels.push(dayNames[d.getDay()]);

      const dayOrders = orders.filter(o => {
        const od = new Date(o.completed_at);
        return od.toDateString() === d.toDateString();
      });

      groomingData.push(dayOrders.filter(o => {
        const svc = services.find(s => s.id === o.service_id);
        return svc && (svc.category === 'cat_grooming' || svc.category === 'dog_grooming');
      }).length);

      bathData.push(dayOrders.filter(o => {
        const svc = services.find(s => s.id === o.service_id);
        return svc && svc.category === 'bath';
      }).length);
    }

    return { labels, groomingData, bathData };
  },

  // Clear cache
  clearCache() {
    this._servicesCache = null;
    this._employeesCache = null;
  }
};


// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  return document.querySelectorAll(selector);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `${days} يوم`;
}

function elapsedTimer(dateStr) {
  if (!dateStr) return '00:00';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '❌' : '💜'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function playNotificationSound() {
  try {
    const audio = $('#notification-sound');
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  } catch {}
}

function showLoading(container) {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>جاري التحميل...</p>
    </div>
  `;
}


// ==========================================
// WHATSAPP MESSAGING MODULE
// يستخدم Supabase Edge Function (send-whatsapp) التي:
//  - ترسل عبر JT-BOT webhook
//  - تسجل كل محاولة في notification_logs
//  - تعيد المحاولة حتى 3 مرات مع backoff
// ==========================================
const WhatsApp = {
  _enabled: true,

  // الإرسال عبر Edge Function (تسجيل + retry تلقائياً)
  async sendViaEdgeFunction({ phone, customerName, serviceName, petName, eventType, orderId = null }) {
    if (!this._enabled || !phone) return { success: false, error: 'disabled_or_no_phone' };

    try {
      const { data, error } = await supabaseClient.functions.invoke('send-whatsapp', {
        body: {
          order_id: orderId,
          event_type: eventType || 'booking_confirmation',
          phone: phone,
          customer_name: customerName || '',
          service_name: serviceName || '',
          pet_name: petName || ''
        }
      });

      if (error) {
        console.warn(`⚠️ Edge function invoke error [${eventType}]:`, error.message || error);
        // fire a UI toast for visibility (admin/operator only — harmless for customers)
        try { showToast && showToast(`⚠️ فشل إرسال واتساب: ${error.message || 'خطأ'}`, 'warning'); } catch {}
        return { success: false, error: error.message || String(error) };
      }

      if (data && data.success) {
        console.log(`✅ WhatsApp sent via edge function [${eventType}] log=${data.log_id}`);
        return { success: true, log_id: data.log_id };
      } else {
        console.warn(`⚠️ WhatsApp send failed [${eventType}]:`, data?.error);
        try { showToast && showToast(`⚠️ لم تُرسل رسالة الواتساب (${eventType})`, 'warning'); } catch {}
        return { success: false, error: data?.error, log_id: data?.log_id };
      }
    } catch (err) {
      console.warn(`WhatsApp edge function exception [${eventType}]:`, err.message);
      return { success: false, error: err.message };
    }
  },

  async sendBookingConfirmation(phone, customerName, petName, serviceNameAr, orderId = null) {
    console.log('📤 Sending booking confirmation to:', phone);
    return this.sendViaEdgeFunction({
      phone, customerName, serviceName: serviceNameAr, petName,
      eventType: 'booking_confirmation', orderId
    });
  },

  async sendTaskStarted(phone, customerName, petName, serviceNameAr, employeeName, orderId = null) {
    console.log('📤 Sending task started notification to:', phone);
    return this.sendViaEdgeFunction({
      phone, customerName, serviceName: serviceNameAr, petName,
      eventType: 'task_started', orderId
    });
  },

  async sendTaskCompleted(phone, customerName, petName, serviceNameAr, durationMinutes, orderId = null) {
    console.log('📤 Sending task completed notification to:', phone);
    return this.sendViaEdgeFunction({
      phone, customerName, serviceName: serviceNameAr, petName,
      eventType: 'task_completed', orderId
    });
  },

  // جدولة رسالة feedback بعد X دقيقة من الإكمال
  async scheduleFeedbackRequest({ phone, customerName, petName, serviceNameAr, orderId, delayMinutes = 60 }) {
    if (!phone) return false;
    try {
      const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
      const { error } = await supabaseClient.from('pending_notifications').insert({
        order_id: orderId || null,
        event_type: 'feedback_request',
        phone,
        customer_name: customerName || '',
        pet_name: petName || '',
        service_name: serviceNameAr || '',
        scheduled_at: scheduledAt
      });
      if (error) {
        console.warn('Failed to schedule feedback:', error.message);
        return false;
      }
      console.log(`⏰ Feedback scheduled for ${phone} at ${scheduledAt}`);
      return true;
    } catch (err) {
      console.warn('scheduleFeedbackRequest error:', err.message);
      return false;
    }
  }
};


// ==========================================
// ROUTER & MENU
// ==========================================
const Router = {
  currentView: null,

  init() {
    window.addEventListener('hashchange', () => this.route());
    this.route();
    this._initMenu();
    this._initLogout();
  },

  _initMenu() {
    const menuToggle = $('#menu-toggle');
    const fullscreenMenu = $('#fullscreen-menu');
    const nav = $('#main-nav');
    const menuLinks = $$('.menu-link');

    if (!menuToggle || !fullscreenMenu || !nav) return;

    menuToggle.addEventListener('click', () => {
      const isActive = fullscreenMenu.classList.toggle('is-active');
      nav.classList.toggle('menu-open');
      menuToggle.querySelector('.menu-text').textContent = isActive ? 'إغلاق' : 'القائمة';
    });

    menuLinks.forEach(link => {
      link.addEventListener('click', () => {
        fullscreenMenu.classList.remove('is-active');
        nav.classList.remove('menu-open');
        menuToggle.querySelector('.menu-text').textContent = 'القائمة';
      });
    });
  },

  _initLogout() {
    const logoutBtn = $('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await Auth.logout();
        showToast('تم تسجيل الخروج بنجاح', 'info');
        window.location.hash = '#booking';
      });
    }
  },

  route() {
    const hash = window.location.hash.replace('#', '') || 'booking';
    this.navigate(hash);
  },

  async navigate(view) {
    // Check auth for protected routes (admin only)
    if (view === 'operator' || view === 'dashboard') {
      // Block employee PIN users from admin areas
      const savedEmployee = sessionStorage.getItem('alkokh_employee');
      if (savedEmployee && !Auth.isAuthenticated()) {
        showToast('⛔ هذه الصفحة للإدارة فقط', 'warning');
        window.location.hash = '#employee';
        return;
      }
      if (!Auth.isAuthenticated()) {
        this.currentView = 'login';
        LoginView.render($('#app'), view);
        return;
      }
    }

    this.currentView = view;

    // Remove active state from nav links
    $$('.nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
    });

    // Render view
    const app = $('#app');

    switch (view) {
      case 'booking':
        await BookingView.render(app);
        break;
      case 'employee':
        await EmployeeView.render(app);
        break;
      case 'operator':
        await OperatorView.render(app);
        break;
      case 'dashboard':
        await DashboardView.render(app);
        break;
      default:
        await BookingView.render(app);
    }
  }
};


// ==========================================
// LOGIN VIEW
// ==========================================
const LoginView = {
  _redirectTo: 'operator',

  render(container, redirectTo = 'operator') {
    this._redirectTo = redirectTo;

    container.innerHTML = `
      <div class="login-container animate-in">
        <div class="login-card">
          <div class="login-header">
            <div class="login-logo">
              <img src="assets/logo.svg" alt="الكوخ">
            </div>
            <h1>عيادة الكوخ البيطرية</h1>
            <p>تسجيل دخول المدير</p>
          </div>
          <div class="login-body">
            <div class="login-alert" id="login-error" style="display:none;">
              <span>❌</span>
              <span id="login-error-msg">البريد الإلكتروني أو كلمة المرور غير صحيحة</span>
            </div>
            <div class="form-group">
              <label class="form-label">البريد الإلكتروني</label>
              <input type="email" class="form-input login-input" id="login-email" placeholder="admin@example.com" autocomplete="email" dir="ltr">
            </div>
            <div class="form-group">
              <label class="form-label">كلمة المرور</label>
              <div class="password-wrapper">
                <input type="password" class="form-input login-input" id="login-password" placeholder="••••••••" autocomplete="current-password" dir="ltr">
                <button class="password-toggle" id="toggle-password" type="button" title="إظهار/إخفاء">👁️</button>
              </div>
            </div>
            <button class="btn btn-primary btn-lg btn-block login-submit" id="login-submit">
              <span id="login-btn-text">🔐 تسجيل الدخول</span>
              <span id="login-btn-loading" style="display:none;">
                <span class="btn-spinner"></span> جاري الدخول...
              </span>
            </button>
          </div>
          <div class="login-footer">
            <p>الدخول مقتصر على الإدارة فقط</p>
            <a href="#booking" class="login-back-link">← العودة لصفحة الحجز</a>
          </div>
        </div>
      </div>
    `;

    this._bindEvents(container);
    setTimeout(() => container.querySelector('#login-email')?.focus(), 300);
  },

  _bindEvents(container) {
    const form = container;
    const submitBtn = form.querySelector('#login-submit');
    const emailInput = form.querySelector('#login-email');
    const passwordInput = form.querySelector('#login-password');
    const togglePassword = form.querySelector('#toggle-password');
    const errorDiv = form.querySelector('#login-error');
    const errorMsg = form.querySelector('#login-error-msg');

    // Toggle password visibility
    togglePassword?.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePassword.textContent = type === 'password' ? '👁️' : '🙈';
    });

    // Submit handler
    const handleLogin = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        errorDiv.style.display = 'flex';
        errorMsg.textContent = 'الرجاء إدخال البريد الإلكتروني وكلمة المرور';
        return;
      }

      // Show loading
      form.querySelector('#login-btn-text').style.display = 'none';
      form.querySelector('#login-btn-loading').style.display = 'inline-flex';
      submitBtn.disabled = true;
      errorDiv.style.display = 'none';

      try {
        await Auth.login(email, password);
        showToast('تم تسجيل الدخول بنجاح! مرحباً بك 👋', 'success');
        playNotificationSound();
        // Navigate directly instead of hash change (hash may already be set)
        window.location.hash = '#' + this._redirectTo;
        await Router.navigate(this._redirectTo);
      } catch (err) {
        console.error('Login error:', err);
        errorDiv.style.display = 'flex';
        errorMsg.textContent = err.message === 'Invalid login credentials'
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
          : 'حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.';
      } finally {
        form.querySelector('#login-btn-text').style.display = 'inline';
        form.querySelector('#login-btn-loading').style.display = 'none';
        submitBtn.disabled = false;
      }
    };

    submitBtn?.addEventListener('click', handleLogin);

    // Enter key to submit
    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin();
    });
    emailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') passwordInput?.focus();
    });
  }
};


// ==========================================
// BOOKING VIEW
// ==========================================
const BookingView = {
  step: 1,
  selectedCategory: null,
  selectedServiceId: null,
  petType: null,
  _services: [],

  async render(container) {
    this.step = 1;
    this.selectedCategory = null;
    this.selectedServiceId = null;
    this.petType = null;

    // Pre-fetch services
    showLoading(container);
    this._services = await DB.getServices();
    this._renderStep(container);
  },

  _renderStep(container) {
    container.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'page-header animate-in';
    header.innerHTML = `
      <div class="brand-badge">🐾 عيادة الكوخ البيطرية</div>
      <h1>حجز خدمة الحلاقة والتحميم</h1>
      <p>اختر الخدمة المناسبة لرفيقك</p>
    `;
    container.appendChild(header);

    // Steps indicator
    const stepsHtml = `
      <div class="booking-steps animate-in-delay-1">
        <div class="step ${this.step >= 1 ? 'active' : ''} ${this.step > 1 ? 'completed' : ''}">
          <div class="step-number">${this.step > 1 ? '✓' : '1'}</div>
          <span class="step-label">نوع الخدمة</span>
        </div>
        <div class="step-connector ${this.step > 1 ? 'completed' : ''}"></div>
        <div class="step ${this.step >= 2 ? 'active' : ''} ${this.step > 2 ? 'completed' : ''}">
          <div class="step-number">${this.step > 2 ? '✓' : '2'}</div>
          <span class="step-label">تفاصيل الخدمة</span>
        </div>
        <div class="step-connector ${this.step > 2 ? 'completed' : ''}"></div>
        <div class="step ${this.step >= 3 ? 'active' : ''} ${this.step > 3 ? 'completed' : ''}">
          <div class="step-number">${this.step > 3 ? '✓' : '3'}</div>
          <span class="step-label">المعلومات</span>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', stepsHtml);

    // Content based on step
    const content = document.createElement('div');
    content.className = 'animate-in-delay-2';

    switch (this.step) {
      case 1:
        this._renderCategorySelection(content);
        break;
      case 2:
        this._renderTypeSelection(content);
        break;
      case 3:
        this._renderInfoForm(content);
        break;
      case 4:
        this._renderConfirmation(content);
        break;
    }

    container.appendChild(content);
  },

  _renderCategorySelection(el) {
    el.innerHTML = `
      <div class="service-grid">
        <div class="service-card" data-category="cat_grooming" id="svc-cat">
          <span class="emoji"><img src="assets/alkokh_icons/cat.png" alt="قطة"></span>
          <div class="title">حلاقة قطة</div>
          <div class="subtitle">قصات متنوعة للقطط</div>
        </div>
        <div class="service-card" data-category="dog_grooming" id="svc-dog">
          <span class="emoji"><img src="assets/alkokh_icons/dog.png" alt="كلب"></span>
          <div class="title">حلاقة كلب</div>
          <div class="subtitle">قصات متنوعة للكلاب</div>
        </div>
        <div class="service-card" data-category="bath" id="svc-bath">
          <span class="emoji"><img src="assets/alkokh_icons/bath.png" alt="تحميم"></span>
          <div class="title">تحميم</div>
          <div class="subtitle">تحميم اعتيادي أو طبي</div>
        </div>
      </div>
    `;

    el.querySelectorAll('.service-card').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedCategory = card.dataset.category;
        this.petType = card.dataset.category === 'cat_grooming' ? 'cat' :
                       card.dataset.category === 'dog_grooming' ? 'dog' : null;
        this.step = 2;
        this._renderStep($('#app'));
      });
    });
  },

  _renderTypeSelection(el) {
    const services = this._services.filter(s => s.category === this.selectedCategory);
    const categoryNames = {
      'cat_grooming': '🐱 حلاقة قطة',
      'dog_grooming': '🐕 حلاقة كلب',
      'bath': '🛁 تحميم'
    };

    let html = `
      <div style="text-align:center; margin-bottom: 20px;">
        <h2 style="font-size:1.3rem; font-weight:800; margin-bottom:4px;">${categoryNames[this.selectedCategory]}</h2>
        <p style="color:var(--text-secondary); font-size:0.9rem;">اختر نوع الخدمة</p>
      </div>
      <div class="type-grid">
    `;

    services.forEach(svc => {
      html += `
        <button class="type-btn" data-service-id="${svc.id}" id="type-${svc.id}">
          <span class="type-icon"><img src="${svc.icon}" alt="${svc.type_ar}"></span>
          <span>${svc.type_ar}</span>
        </button>
      `;
    });

    html += `</div>
      <div style="text-align:center; margin-top:20px;">
        <button class="btn btn-ghost" id="back-to-step1">→ رجوع</button>
      </div>`;

    el.innerHTML = html;

    // If bath, ask about pet type
    if (this.selectedCategory === 'bath') {
      const petSelector = document.createElement('div');
      petSelector.style.cssText = 'text-align:center; margin-bottom:20px;';
      petSelector.innerHTML = `
        <p style="font-weight:700; margin-bottom:12px;">نوع الحيوان:</p>
        <div style="display:flex;gap:20px;justify-content:center;">
          <button class="btn pet-btn ${this.petType === 'cat' ? 'pet-btn-active' : ''}" id="pet-cat">
            <img src="assets/alkokh_icons/cat.png" class="pet-icon"> 
            <span>قطة</span>
          </button>
          <button class="btn pet-btn ${this.petType === 'dog' ? 'pet-btn-active' : ''}" id="pet-dog">
            <img src="assets/alkokh_icons/dog.png" class="pet-icon"> 
            <span>كلب</span>
          </button>
        </div>
      `;
      el.querySelector('.type-grid').before(petSelector);

      el.querySelector('#pet-cat')?.addEventListener('click', () => {
        this.petType = 'cat';
        this._renderStep($('#app'));
      });
      el.querySelector('#pet-dog')?.addEventListener('click', () => {
        this.petType = 'dog';
        this._renderStep($('#app'));
      });
    }

    el.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedServiceId = btn.dataset.serviceId;
        if (this.selectedCategory === 'bath' && !this.petType) {
          showToast('الرجاء اختيار نوع الحيوان أولاً', 'warning');
          return;
        }
        this.step = 3;
        this._renderStep($('#app'));
      });
    });

    el.querySelector('#back-to-step1')?.addEventListener('click', () => {
      this.step = 1;
      this._renderStep($('#app'));
    });
  },

  _renderInfoForm(el) {
    const service = this._services.find(s => s.id === this.selectedServiceId);

    el.innerHTML = `
      <div class="card" style="max-width:500px; margin:0 auto;">
        <div class="card-body">
          <div style="text-align:center; margin-bottom:24px;">
            <div class="order-service" style="display:inline-flex; padding:8px 20px; font-size:0.95rem;">
              <img src="${service?.icon || ''}" class="icon-inline"> ${service?.type_ar || ''}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">اسم صاحب الحيوان *</label>
            <input type="text" class="form-input" id="customer-name" placeholder="مثال: أحمد" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">رقم الهاتف *</label>
            <input type="tel" class="form-input" id="customer-phone" placeholder="مثال: 07801234567" autocomplete="tel" dir="ltr" style="text-align:left;" required>
          </div>
          <div class="form-group">
            <label class="form-label">اسم الحيوان *</label>
            <input type="text" class="form-input" id="pet-name" placeholder="مثال: بادي" autocomplete="off">
          </div>
          <div class="form-group">
            <label class="form-label">ملاحظات (اختياري)</label>
            <input type="text" class="form-input" id="order-notes" placeholder="أي تفاصيل إضافية..." autocomplete="off">
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="submit-booking" style="margin-top:8px;">
            <span id="booking-btn-text">📋 تأكيد الحجز</span>
            <span id="booking-btn-loading" style="display:none;">
              <span class="btn-spinner"></span> جاري التسجيل...
            </span>
          </button>
          <div style="text-align:center; margin-top:16px;">
            <button class="btn btn-ghost" id="back-to-step2">→ رجوع</button>
          </div>
        </div>
      </div>
    `;

    el.querySelector('#submit-booking')?.addEventListener('click', async () => {
      const customerName = el.querySelector('#customer-name')?.value.trim();
      const customerPhone = el.querySelector('#customer-phone')?.value.trim();
      const petName = el.querySelector('#pet-name')?.value.trim();
      const notes = el.querySelector('#order-notes')?.value.trim();
      const submitBtn = el.querySelector('#submit-booking');

      if (!customerName) {
        showToast('الرجاء إدخال اسم صاحب الحيوان', 'warning');
        el.querySelector('#customer-name')?.focus();
        return;
      }
      if (!customerPhone) {
        showToast('الرجاء إدخال رقم الهاتف', 'warning');
        el.querySelector('#customer-phone')?.focus();
        return;
      }
      if (!petName) {
        showToast('الرجاء إدخال اسم الحيوان', 'warning');
        el.querySelector('#pet-name')?.focus();
        return;
      }

      // Show loading
      el.querySelector('#booking-btn-text').style.display = 'none';
      el.querySelector('#booking-btn-loading').style.display = 'inline-flex';
      submitBtn.disabled = true;

      try {
        const newOrderId = await DB.addOrder({
          customer_name: customerName,
          customer_phone: customerPhone || null,
          pet_name: petName,
          pet_type: this.petType,
          service_id: this.selectedServiceId,
          notes: notes || ''
        });

        // Send WhatsApp booking confirmation (non-blocking, logged via edge function)
        if (customerPhone) {
          const service = this._services.find(s => s.id === this.selectedServiceId);
          WhatsApp.sendBookingConfirmation(
            customerPhone, customerName, petName, service?.type_ar || '',
            typeof newOrderId === 'string' ? newOrderId : null
          ).catch(() => {});
        }

        playNotificationSound();
        this.step = 4;
        this._renderStep($('#app'));
      } catch (err) {
        console.error('Booking error:', err);
        showToast('حدث خطأ أثناء تسجيل الحجز. يرجى المحاولة مرة أخرى.', 'error');
        el.querySelector('#booking-btn-text').style.display = 'inline';
        el.querySelector('#booking-btn-loading').style.display = 'none';
        submitBtn.disabled = false;
      }
    });

    el.querySelector('#back-to-step2')?.addEventListener('click', () => {
      this.step = 2;
      this._renderStep($('#app'));
    });

    // Auto-focus
    setTimeout(() => el.querySelector('#customer-name')?.focus(), 300);
  },

  async _renderConfirmation(el) {
    const waitingCount = await DB.getWaitingCount();

    el.innerHTML = `
      <div class="confirmation">
        <div class="checkmark">✅</div>
        <h2>تم تسجيل الحجز بنجاح!</h2>
        <p>تمت إضافة رفيقك إلى قائمة الانتظار</p>
        <div class="queue-number">${waitingCount}</div>
        <p style="font-size:0.85rem; margin-bottom:24px;">ترتيبك في قائمة الانتظار</p>
        <button class="btn btn-primary btn-lg" id="new-booking">
          ➕ حجز خدمة جديدة
        </button>
      </div>
    `;

    el.querySelector('#new-booking')?.addEventListener('click', () => {
      this.step = 1;
      this._renderStep($('#app'));
    });
  }
};


// ==========================================
// OPERATOR VIEW
// ==========================================
const OperatorView = {
  timerInterval: null,

  async render(container) {
    showLoading(container);
    await this._buildUI(container);
    this._startTimers();
  },

  async _buildUI(container) {
    const orders = await DB.getOrders();
    const services = await DB.getServices();
    const employees = await DB.getEmployees();

    const waiting = orders.filter(o => o.status === 'waiting');
    const assigned = orders.filter(o => o.status === 'assigned');
    const inProgress = orders.filter(o => o.status === 'in_progress');
    const completed = orders.filter(o => o.status === 'completed')
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
      .slice(0, 10);

    let html = `
      <div class="page-header animate-in">
        <h1>⚙️ لوحة تحكم المنظم</h1>
        <p>قم بتوزيع المهام وإدارة قائمة الانتظار</p>
      </div>
    `;

    // Quick stats
    html += `
      <div class="stats-grid animate-in-delay-1">
        <div class="stat-card gold">
          <span class="stat-icon">⏳</span>
          <div class="stat-value">${waiting.length}</div>
          <div class="stat-label">بالانتظار</div>
        </div>
        <div class="stat-card blue">
          <span class="stat-icon">📩</span>
          <div class="stat-value">${assigned.length}</div>
          <div class="stat-label">بانتظار القبول</div>
        </div>
        <div class="stat-card purple">
          <span class="stat-icon">🔄</span>
          <div class="stat-value">${inProgress.length}</div>
          <div class="stat-label">قيد التنفيذ</div>
        </div>
        <div class="stat-card green">
          <span class="stat-icon">✅</span>
          <div class="stat-value">${orders.filter(o => o.status === 'completed').length}</div>
          <div class="stat-label">مكتمل اليوم</div>
        </div>
      </div>
    `;

    // Waiting section
    html += `<div class="queue-section animate-in-delay-2">`;
    html += `
      <div class="queue-section-title">
        ⏳ قائمة الانتظار
        <span class="badge badge-waiting">${waiting.length}</span>
      </div>
    `;

    if (waiting.length === 0) {
      html += `<div class="empty-state"><span class="emoji">😊</span><p>لا توجد حالات بالانتظار حالياً</p></div>`;
    } else {
      waiting.forEach(order => {
        html += this._renderOrderCard(order, services, employees, 'waiting');
      });
    }
    html += `</div>`;

    // Assigned section (waiting for employee acceptance)
    if (assigned.length > 0) {
      html += `<div class="queue-section">`;
      html += `
        <div class="queue-section-title">
          📩 بانتظار قبول الموظف
          <span class="badge badge-assigned">${assigned.length}</span>
        </div>
      `;
      assigned.forEach(order => {
        html += this._renderOrderCard(order, services, employees, 'assigned');
      });
      html += `</div>`;
    }

    // In Progress section
    html += `<div class="queue-section">`;
    html += `
      <div class="queue-section-title">
        🔄 قيد التنفيذ
        <span class="badge badge-in-progress">${inProgress.length}</span>
      </div>
    `;

    if (inProgress.length === 0) {
      html += `<div class="empty-state"><span class="emoji">💤</span><p>لا توجد مهام قيد التنفيذ</p></div>`;
    } else {
      inProgress.forEach(order => {
        html += this._renderOrderCard(order, services, employees, 'in_progress');
      });
    }
    html += `</div>`;

    // Recent completed
    if (completed.length > 0) {
      html += `<div class="queue-section">`;
      html += `
        <div class="queue-section-title">
          ✅ المكتملة مؤخراً
          <span class="badge badge-completed">${completed.length}</span>
        </div>
      `;
      completed.forEach(order => {
        html += this._renderOrderCard(order, services, employees, 'completed');
      });
      html += `</div>`;
    }

    container.innerHTML = html;
    this._bindEvents(container);
  },

  _renderOrderCard(order, services, employees, statusSection) {
    const service = services.find(s => s.id === order.service_id);
    const employee = employees.find(e => e.id === order.employee_id);

    let actionsHtml = '';

    if (statusSection === 'waiting') {
      const isGrooming = service && (service.category === 'cat_grooming' || service.category === 'dog_grooming');
      const eligibleEmployees = employees.filter(e =>
        isGrooming ? e.specialization === 'groomer' : e.specialization === 'bather'
      );

      actionsHtml = `
        <div class="order-actions" style="display:flex; flex-wrap:wrap; gap:8px;">
          ${eligibleEmployees.map(emp => `
            <button class="employee-btn" data-order-id="${order.id}" data-employee-id="${emp.id}">
              <div class="employee-avatar" style="background:${emp.avatar_color}">${emp.name_ar.charAt(0)}</div>
              <span>${emp.name_ar}</span>
            </button>
          `).join('')}
          <button class="btn btn-danger btn-icon" data-cancel-id="${order.id}" title="إلغاء">✕</button>
        </div>
      `;
    } else if (statusSection === 'assigned') {
      // Admin can reassign to another employee or cancel
      const isGrooming = service && (service.category === 'cat_grooming' || service.category === 'dog_grooming');
      const eligibleEmployees = employees.filter(e =>
        (isGrooming ? e.specialization === 'groomer' : e.specialization === 'bather') && e.id !== order.employee_id
      );

      actionsHtml = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
          <div class="employee-avatar" style="background:${employee?.avatar_color || '#666'}; width:32px; height:32px; font-size:0.8rem;">${employee?.name_ar?.charAt(0) || '?'}</div>
          <span style="font-weight:700; font-size:0.95rem; color:var(--white);">موجهة لـ ${employee?.name_ar || 'غير معروف'}</span>
          <span class="badge badge-assigned" style="margin-right:auto;">بانتظار القبول</span>
        </div>
        ${eligibleEmployees.length > 0 ? `
          <div class="order-actions" style="display:flex; flex-wrap:wrap; gap:8px;">
            <span style="font-size:0.8rem; color:var(--purple-200); width:100%; margin-bottom:4px;">↔️ نقل المهمة إلى:</span>
            ${eligibleEmployees.map(emp => `
              <button class="employee-btn" style="font-size:0.85rem; padding:8px 12px;" data-reassign-order="${order.id}" data-reassign-employee="${emp.id}">
                <div class="employee-avatar" style="background:${emp.avatar_color}; width:24px; height:24px; font-size:0.65rem;">${emp.name_ar.charAt(0)}</div>
                <span>${emp.name_ar}</span>
              </button>
            `).join('')}
            <button class="btn btn-danger btn-icon" data-cancel-id="${order.id}" title="إلغاء" style="font-size:0.8rem;">✕</button>
          </div>
        ` : `
          <div class="order-actions" style="margin-top:8px;">
            <button class="btn btn-danger btn-icon" data-cancel-id="${order.id}" title="إلغاء">✕ إلغاء</button>
          </div>
        `}
      `;
    } else if (statusSection === 'in_progress') {
      // Admin can only see in-progress, employee completes it
      // Admin can still reassign or delete
      const isGrooming = service && (service.category === 'cat_grooming' || service.category === 'dog_grooming');
      const eligibleEmployees = employees.filter(e =>
        (isGrooming ? e.specialization === 'groomer' : e.specialization === 'bather') && e.id !== order.employee_id
      );

      actionsHtml = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-top:12px; border-top:1px dashed rgba(255,255,255,0.1);">
          <div class="employee-avatar" style="background:${employee?.avatar_color || '#666'}; width:32px; height:32px; font-size:0.8rem;">${employee?.name_ar?.charAt(0) || '?'}</div>
          <span style="font-weight:700; font-size:0.95rem; color:var(--white);">${employee?.name_ar || ''}</span>
          <span style="font-size:0.8rem; color:var(--purple-200); margin-right:auto;">يعمل عليها</span>
        </div>
        <div class="order-actions" style="display:flex; gap:8px; margin-top:8px;">
          ${eligibleEmployees.length > 0 ? `
            <select class="reassign-select" data-reassign-inprogress-order="${order.id}" style="flex:1; padding:10px; border-radius:var(--radius-md); background:rgba(255,255,255,0.08); color:var(--white); border:1px solid rgba(255,255,255,0.15); font-family:var(--font-ar); font-size:0.85rem; cursor:pointer;">
              <option value="">↔️ نقل المهمة...</option>
              ${eligibleEmployees.map(emp => `<option value="${emp.id}">${emp.name_ar}</option>`).join('')}
            </select>
          ` : ''}
          <button class="btn btn-danger" data-delete-id="${order.id}" title="حذف" style="border-radius:var(--radius-md); width:56px; padding:0; display:flex; justify-content:center; align-items:center;">
            🗑️
          </button>
        </div>
      `;
    } else {
      // Completed or cancelled
      actionsHtml = `
        <div class="order-actions" style="margin-top:16px;">
          <button class="btn btn-danger btn-block" data-delete-id="${order.id}" style="background:rgba(239, 68, 68, 0.15); color:#fca5a5; border:1px solid rgba(239, 68, 68, 0.3);">
            🗑️ حذف السجل نهائياً
          </button>
        </div>
      `;
    }

    const phoneDisplay = order.customer_phone
      ? `<span class="order-phone" style="opacity:0.8;">📱 ${order.customer_phone}</span>`
      : '';

    return `
      <div class="order-card status-${order.status}" data-order-id="${order.id}">
        <div class="order-header" style="margin-bottom:16px;">
            <div class="order-pet">
              <div class="order-pet-emoji"><img src="assets/alkokh_icons/${order.pet_type === 'cat' ? 'cat.png' : 'dog.png'}" alt="pet"></div>
              <div class="order-pet-info">
                <h3>${order.pet_name}</h3>
                <p>${order.customer_name} · ${timeAgo(order.created_at)} ${phoneDisplay}</p>
              </div>
            </div>
        </div>
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div class="order-service"><img src="${service?.icon || ''}" class="icon-inline"> ${service?.type_ar || ''}</div>
            ${statusSection === 'in_progress' ? `
              <div class="order-timer" data-timer-start="${order.started_at}">
                ⏱ <span class="timer-display">${elapsedTimer(order.started_at)}</span>
              </div>
            ` : ''}
            ${statusSection === 'completed' && employee ? `
              <div style="font-size:0.8rem; color:var(--purple-200); text-align: left;">
                ${employee.name_ar} · ${order.duration_actual || 0} دقيقة
              </div>
            ` : ''}
        </div>
        
        ${order.notes ? `<p style="font-size:0.85rem; color:var(--purple-200); margin-bottom:16px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">📝 ${order.notes}</p>` : ''}
        
        ${actionsHtml}
      </div>
    `;
  },

  _bindEvents(container) {
    // Assign to employee (waiting → assigned)
    container.querySelectorAll('.employee-btn[data-order-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.orderId;
        const employeeId = btn.dataset.employeeId;
        const employees = await DB.getEmployees();
        const employee = employees.find(e => e.id === employeeId);

        try {
          btn.disabled = true;
          btn.style.opacity = '0.5';

          const res = await DB.assignOrder(orderId, employeeId);
          if (res) {
            showToast(`📩 تم توجيه المهمة إلى ${employee?.name_ar || ''} — بانتظار قبوله`, 'success');
            playNotificationSound();
            await this._buildUI($('#app'));
            this._startTimers();
          } else {
            throw new Error('فشل التوجيه');
          }
        } catch (error) {
          console.error(error);
          showToast('❌ حدث خطأ، حاول مرة أخرى', 'error');
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
    });

    // Reassign order (assigned → assigned to different employee)
    container.querySelectorAll('[data-reassign-order]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.reassignOrder;
        const newEmployeeId = btn.dataset.reassignEmployee;
        const employees = await DB.getEmployees();
        const employee = employees.find(e => e.id === newEmployeeId);

        try {
          btn.disabled = true;
          btn.style.opacity = '0.5';

          const res = await DB.reassignOrder(orderId, newEmployeeId);
          if (res) {
            showToast(`↔️ تم نقل المهمة إلى ${employee?.name_ar || ''}`, 'success');
            await this._buildUI($('#app'));
            this._startTimers();
          } else {
            throw new Error('فشل نقل المهمة');
          }
        } catch (error) {
          console.error(error);
          showToast('❌ حدث خطأ، حاول مرة أخرى', 'error');
          btn.disabled = false;
          btn.style.opacity = '1';
        }
      });
    });

    // Reassign from in-progress (dropdown select)
    container.querySelectorAll('.reassign-select').forEach(select => {
      select.addEventListener('change', async () => {
        const orderId = select.dataset.reassignInprogressOrder;
        const newEmployeeId = select.value;
        const originalValue = select.dataset.originalValue || "";
        if (!newEmployeeId) return;

        if (!confirm('هل تريد نقل هذه المهمة؟ سيتم إعادة ضبط العداد.')) {
          select.value = originalValue;
          return;
        }

        try {
          select.disabled = true;
          const employees = await DB.getEmployees();
          const employee = employees.find(e => e.id === newEmployeeId);

          const res = await DB.reassignOrder(orderId, newEmployeeId);
          if (res) {
            showToast(`↔️ تم نقل المهمة إلى ${employee?.name_ar || ''}`, 'success');
            await this._buildUI($('#app'));
            this._startTimers();
          } else {
            throw new Error('فشل نقل المهمة');
          }
        } catch (error) {
          console.error(error);
          showToast('❌ حدث خطأ في نقل المهمة', 'error');
          select.value = originalValue;
          select.disabled = false;
        }
      });
    });

    // Cancel order (changes status to cancelled)
    container.querySelectorAll('[data-cancel-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من إلغاء هذا الطلب؟')) return;
        const orderId = btn.dataset.cancelId;
        const originalText = btn.innerHTML;

        try {
          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spinner"></span>...';

          const res = await DB.cancelOrder(orderId);
          if (res) {
            showToast('تم إلغاء الطلب', 'warning');
            await this._buildUI($('#app'));
            this._startTimers();
          } else {
            throw new Error('فشل الإلغاء');
          }
        } catch (error) {
          console.error('Delete Event Error:', error);
          showToast(`❌ تعذر الحذف: ${error.message || 'تأكد من الصلاحيات والاتصال'}`, 'error');
          if (document.body.contains(btn)) {
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
        }
      });
    });

    // Delete order (removes from database entirely)
    container.querySelectorAll('[data-delete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من حذف هذا السجل نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
        const orderId = btn.dataset.deleteId;
        const originalText = btn.innerHTML;
        
        try {
          btn.disabled = true;
          btn.innerHTML = '<span class="btn-spinner"></span>...';

          const success = await DB.deleteOrder(orderId);
          
          if (success) {
            showToast('تم حذف السجل بنجاح 🗑️', 'info');
            await this._buildUI($('#app'));
            this._startTimers();
          } else {
            throw new Error('فشلت عملية الحذف في قاعدة البيانات');
          }
        } catch (error) {
          console.error('Delete Event Error:', error);
          showToast(`❌ تعذر الحذف: ${error.message || 'تأكد من الصلاحيات والاتصال'}`, 'error');
          if (document.body.contains(btn)) {
            btn.disabled = false;
            btn.innerHTML = originalText;
          }
        }
      });
    });
  },

  _startTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      $$('.order-timer').forEach(timer => {
        const start = timer.dataset.timerStart;
        if (start) {
          timer.querySelector('.timer-display').textContent = elapsedTimer(start);
        }
      });
    }, 1000);
  }
};


// ==========================================
// EMPLOYEE VIEW
// ==========================================
const EmployeeView = {
  _employee: null,
  _refreshInterval: null,
  timerInterval: null,
  _lastOrderCount: 0,

  async render(container) {
    // Check if employee is already logged in (session)
    const savedEmployee = sessionStorage.getItem('alkokh_employee');
    if (savedEmployee) {
      try {
        this._employee = JSON.parse(savedEmployee);
        showLoading(container);
        await this._buildTasksUI(container);
        this._startTimers();
        this._startAutoRefresh(container);
        return;
      } catch (e) {
        sessionStorage.removeItem('alkokh_employee');
      }
    }
    this._renderPinLogin(container);
  },

  _renderPinLogin(container) {
    container.innerHTML = `
      <div class="employee-login-container animate-in">
        <div class="employee-login-card">
          <div class="employee-login-header">
            <img src="assets/logo.svg" alt="الكوخ" style="width:60px; height:60px; margin-bottom:16px;">
            <h1>صفحة الموظف</h1>
            <p>أدخل رمز الدخول الخاص بك</p>
          </div>
          <div class="pin-input-container">
            <input type="password" class="pin-digit" id="pin-1" maxlength="1" inputmode="numeric" pattern="[0-9]*" autofocus>
            <input type="password" class="pin-digit" id="pin-2" maxlength="1" inputmode="numeric" pattern="[0-9]*">
            <input type="password" class="pin-digit" id="pin-3" maxlength="1" inputmode="numeric" pattern="[0-9]*">
            <input type="password" class="pin-digit" id="pin-4" maxlength="1" inputmode="numeric" pattern="[0-9]*">
          </div>
          <div class="pin-error" id="pin-error" style="display:none;">
            ❌ رمز الدخول غير صحيح
          </div>
          <button class="btn btn-primary btn-lg btn-block" id="pin-submit" style="margin-top:24px;">
            <span id="pin-btn-text">🔓 دخول</span>
            <span id="pin-btn-loading" style="display:none;">
              <span class="btn-spinner"></span> جاري التحقق...
            </span>
          </button>
          <div style="text-align:center; margin-top:16px;">
            <a href="#booking" class="login-back-link">← العودة لصفحة الحجز</a>
          </div>
        </div>
      </div>
    `;

    this._bindPinEvents(container);
  },

  _bindPinEvents(container) {
    const digits = [1, 2, 3, 4].map(i => container.querySelector(`#pin-${i}`));
    const errorDiv = container.querySelector('#pin-error');
    const submitBtn = container.querySelector('#pin-submit');

    // Auto-focus and auto-advance
    digits.forEach((input, idx) => {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '');
        if (input.value && idx < 3) {
          digits[idx + 1].focus();
        }
        errorDiv.style.display = 'none';
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) {
          digits[idx - 1].focus();
          digits[idx - 1].value = '';
        }
        if (e.key === 'Enter') {
          handlePinSubmit();
        }
      });

      // Select all on focus for easy re-entry
      input.addEventListener('focus', () => input.select());
    });

    const handlePinSubmit = async () => {
      const pin = digits.map(d => d.value).join('');
      if (pin.length !== 4) {
        errorDiv.textContent = '⚠️ الرجاء إدخال 4 أرقام';
        errorDiv.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      container.querySelector('#pin-btn-text').style.display = 'none';
      container.querySelector('#pin-btn-loading').style.display = 'inline-flex';

      const employee = await DB.employeeLogin(pin);

      if (employee) {
        this._employee = employee;
        sessionStorage.setItem('alkokh_employee', JSON.stringify(employee));
        showToast(`مرحباً ${employee.name_ar}! 👋`, 'success');
        playNotificationSound();
        showLoading($('#app'));
        await this._buildTasksUI($('#app'));
        this._startTimers();
        this._startAutoRefresh($('#app'));
      } else {
        errorDiv.textContent = '❌ رمز الدخول غير صحيح';
        errorDiv.style.display = 'block';
        digits.forEach(d => { d.value = ''; });
        digits[0].focus();

        // Shake animation
        container.querySelector('.pin-input-container').classList.add('shake');
        setTimeout(() => {
          container.querySelector('.pin-input-container')?.classList.remove('shake');
        }, 600);
      }

      submitBtn.disabled = false;
      container.querySelector('#pin-btn-text').style.display = 'inline';
      container.querySelector('#pin-btn-loading').style.display = 'none';
    };

    submitBtn?.addEventListener('click', handlePinSubmit);
    setTimeout(() => digits[0]?.focus(), 300);
  },

  async _buildTasksUI(container) {
    if (!this._employee) return;

    const orders = await DB.getEmployeeOrders(this._employee.id);
    const completedOrders = await DB.getEmployeeCompleted(this._employee.id);
    const services = await DB.getServices();

    const assigned = orders.filter(o => o.status === 'assigned');
    const inProgress = orders.filter(o => o.status === 'in_progress');

    let html = `
      <div class="page-header animate-in" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
            <div class="employee-avatar" style="background:${this._employee.avatar_color}; width:48px; height:48px; font-size:1.2rem;">${this._employee.name_ar.charAt(0)}</div>
            <div>
              <h1 style="font-size:1.4rem; margin:0;">مرحباً ${this._employee.name_ar}</h1>
              <p style="margin:0; font-size:0.85rem; color:var(--purple-200);">${this._employee.specialization === 'groomer' ? '✂️ حلاّق' : '🛁 مُحمِّم'}</p>
            </div>
          </div>
        </div>
        <button class="btn btn-ghost" id="employee-logout" style="font-size:0.85rem;">🚪 تسجيل خروج</button>
      </div>
    `;

    // Stats
    html += `
      <div class="stats-grid animate-in-delay-1" style="grid-template-columns: repeat(3, 1fr);">
        <div class="stat-card blue">
          <span class="stat-icon">📩</span>
          <div class="stat-value">${assigned.length}</div>
          <div class="stat-label">مهام جديدة</div>
        </div>
        <div class="stat-card purple">
          <span class="stat-icon">🔄</span>
          <div class="stat-value">${inProgress.length}</div>
          <div class="stat-label">قيد التنفيذ</div>
        </div>
        <div class="stat-card green">
          <span class="stat-icon">✅</span>
          <div class="stat-value">${completedOrders.length}</div>
          <div class="stat-label">مكتملة اليوم</div>
        </div>
      </div>
    `;

    // Assigned (new tasks to accept)
    if (assigned.length > 0) {
      html += `<div class="queue-section animate-in-delay-2">`;
      html += `
        <div class="queue-section-title">
          📩 مهام جديدة
          <span class="badge badge-assigned">${assigned.length}</span>
        </div>
      `;
      assigned.forEach(order => {
        const service = services.find(s => s.id === order.service_id);
        html += `
          <div class="order-card status-assigned employee-task-card" data-order-id="${order.id}">
            <div class="order-header" style="margin-bottom:16px;">
              <div class="order-pet">
                <div class="order-pet-emoji"><img src="assets/alkokh_icons/${order.pet_type === 'cat' ? 'cat.png' : 'dog.png'}" alt="pet"></div>
                <div class="order-pet-info">
                  <h3>${order.pet_name}</h3>
                  <p>${order.customer_name} · ${timeAgo(order.created_at)}</p>
                </div>
              </div>
            </div>
            <div style="margin-bottom:16px;">
              <div class="order-service"><img src="${service?.icon || ''}" class="icon-inline"> ${service?.type_ar || ''}</div>
            </div>
            ${order.notes ? `<p style="font-size:0.85rem; color:var(--purple-200); margin-bottom:16px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">📝 ${order.notes}</p>` : ''}
            <button class="btn btn-accept btn-lg btn-block" data-accept-id="${order.id}">
              ✅ قبول ومباشرة العمل
            </button>
          </div>
        `;
      });
      html += `</div>`;
    }

    // In Progress (with timer)
    if (inProgress.length > 0) {
      html += `<div class="queue-section">`;
      html += `
        <div class="queue-section-title">
          🔄 قيد التنفيذ
          <span class="badge badge-in-progress">${inProgress.length}</span>
        </div>
      `;
      inProgress.forEach(order => {
        const service = services.find(s => s.id === order.service_id);
        html += `
          <div class="order-card status-in_progress employee-task-card" data-order-id="${order.id}">
            <div class="order-header" style="margin-bottom:16px;">
              <div class="order-pet">
                <div class="order-pet-emoji"><img src="assets/alkokh_icons/${order.pet_type === 'cat' ? 'cat.png' : 'dog.png'}" alt="pet"></div>
                <div class="order-pet-info">
                  <h3>${order.pet_name}</h3>
                  <p>${order.customer_name}</p>
                </div>
              </div>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <div class="order-service"><img src="${service?.icon || ''}" class="icon-inline"> ${service?.type_ar || ''}</div>
              <div class="employee-timer order-timer" data-timer-start="${order.started_at}">
                ⏱ <span class="timer-display">${elapsedTimer(order.started_at)}</span>
              </div>
            </div>
            ${order.notes ? `<p style="font-size:0.85rem; color:var(--purple-200); margin-bottom:16px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.05);">📝 ${order.notes}</p>` : ''}
            <button class="btn btn-complete-emp btn-lg btn-block" data-emp-complete-id="${order.id}">
              🏁 تم الإنجاز
            </button>
          </div>
        `;
      });
      html += `</div>`;
    }

    // Empty state
    if (assigned.length === 0 && inProgress.length === 0) {
      html += `
        <div class="empty-state animate-in-delay-2" style="padding:60px 20px;">
          <span class="emoji" style="font-size:3rem;">😊</span>
          <p style="font-size:1.1rem; margin-top:16px;">لا توجد مهام حالياً</p>
          <p style="font-size:0.85rem; color:var(--purple-200);">سيتم تنبيهك عند وصول مهمة جديدة</p>
        </div>
      `;
    }

    // Completed today
    if (completedOrders.length > 0) {
      html += `<div class="queue-section" style="margin-top:24px;">`;
      html += `
        <div class="queue-section-title">
          ✅ مكتملة اليوم
          <span class="badge badge-completed">${completedOrders.length}</span>
        </div>
      `;
      completedOrders.forEach(order => {
        const service = services.find(s => s.id === order.service_id);
        html += `
          <div class="order-card status-completed" style="opacity:0.7;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div class="order-pet-emoji"><img src="assets/alkokh_icons/${order.pet_type === 'cat' ? 'cat.png' : 'dog.png'}" alt="pet" style="width:28px; height:28px;"></div>
                <div>
                  <strong>${order.pet_name}</strong>
                  <span style="font-size:0.8rem; color:var(--purple-200);"> · ${order.customer_name}</span>
                </div>
              </div>
              <div style="text-align:left; font-size:0.8rem; color:var(--purple-200);">
                ${order.duration_actual || 0} دقيقة
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }

    container.innerHTML = html;
    this._bindTaskEvents(container);
  },

  _bindTaskEvents(container) {
    // Logout
    container.querySelector('#employee-logout')?.addEventListener('click', () => {
      sessionStorage.removeItem('alkokh_employee');
      this._employee = null;
      this._stopAutoRefresh();
      if (this.timerInterval) clearInterval(this.timerInterval);
      showToast('تم تسجيل الخروج', 'info');
      window.location.hash = '#booking';
    });

    // Accept order
    container.querySelectorAll('[data-accept-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.acceptId;
        btn.disabled = true;
        btn.textContent = '⏳ جاري القبول...';

        const success = await DB.acceptOrder(orderId, this._employee.id);
        if (success) {
          showToast('✅ تم قبول المهمة — ابدأ العمل الآن!', 'success');
          playNotificationSound();

          // Send WhatsApp "task started" notification (non-blocking, logged via edge function)
          try {
            const orders = await DB.getEmployeeOrders(this._employee.id);
            const order = orders.find(o => o.id === orderId);
            if (order?.customer_phone) {
              const services = await DB.getServices();
              const service = services.find(s => s.id === order.service_id);
              WhatsApp.sendTaskStarted(
                order.customer_phone,
                order.customer_name,
                order.pet_name,
                service?.type_ar || '',
                this._employee.name_ar,
                orderId
              ).catch(() => {});
            }
          } catch (e) { /* non-blocking */ }
        } else {
          showToast('❌ حدث خطأ، حاول مرة أخرى', 'error');
        }
        await this._buildTasksUI($('#app'));
        this._startTimers();
      });
    });

    // Complete order
    container.querySelectorAll('[data-emp-complete-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.empCompleteId;

        // Get order details BEFORE completing (so we have phone & service info)
        let orderPhone = null, orderCustomer = '', orderPet = '', orderServiceAr = '';
        try {
          const orders = await DB.getEmployeeOrders(this._employee.id);
          const order = orders.find(o => o.id === orderId);
          if (order) {
            orderPhone = order.customer_phone;
            orderCustomer = order.customer_name;
            orderPet = order.pet_name;
            const services = await DB.getServices();
            const service = services.find(s => s.id === order.service_id);
            orderServiceAr = service?.type_ar || '';
          }
        } catch (e) { /* non-blocking */ }

        btn.disabled = true;
        btn.textContent = '⏳ جاري الحفظ...';

        const duration = await DB.completeOrderEmployee(orderId, this._employee.id);
        if (duration !== null) {
          showToast(`🏁 أحسنت! تم الإنجاز بنجاح (${duration} دقيقة)`, 'success');
          playNotificationSound();

          // Send WhatsApp "task completed" notification (non-blocking, logged)
          if (orderPhone) {
            WhatsApp.sendTaskCompleted(orderPhone, orderCustomer, orderPet, orderServiceAr, duration, orderId).catch(() => {});
            // Schedule feedback request 1 hour later (handled by pg_cron + edge function)
            WhatsApp.scheduleFeedbackRequest({
              phone: orderPhone,
              customerName: orderCustomer,
              petName: orderPet,
              serviceNameAr: orderServiceAr,
              orderId,
              delayMinutes: 60
            }).catch(() => {});
          }
        } else {
          showToast('❌ حدث خطأ، حاول مرة أخرى', 'error');
        }
        await this._buildTasksUI($('#app'));
        this._startTimers();
      });
    });
  },

  _startTimers() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      $$('.order-timer').forEach(timer => {
        const start = timer.dataset.timerStart;
        if (start) {
          timer.querySelector('.timer-display').textContent = elapsedTimer(start);
        }
      });
    }, 1000);
  },

  _startAutoRefresh(container) {
    this._stopAutoRefresh();
    this._refreshInterval = setInterval(async () => {
      if (Router.currentView !== 'employee' || !this._employee) return;
      try {
        const orders = await DB.getEmployeeOrders(this._employee.id);
        const currentCount = orders.filter(o => o.status === 'assigned').length;
        
        if (currentCount > this._lastOrderCount && this._lastOrderCount >= 0) {
          playNotificationSound();
          showToast('📩 مهمة جديدة وصلت!', 'info');
          await this._buildTasksUI($('#app'));
          this._startTimers();
        }
        this._lastOrderCount = currentCount;
      } catch (err) {
        console.warn('Employee auto-refresh error:', err);
      }
    }, 8000);
  },

  _stopAutoRefresh() {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }
};


// ==========================================
// DASHBOARD VIEW
// ==========================================
const DashboardView = {
  period: 'all',
  charts: {},

  async render(container) {
    this.period = 'all';
    showLoading(container);
    await this._buildUI(container);
  },

  async _buildUI(container) {
    const stats = await DB.getStats(this.period);
    const weeklyData = await DB.getWeeklyData();

    let html = `
      <div class="page-header animate-in" style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h1>📊 التقارير والإحصائيات</h1>
          <p>تحليل أداء قسم الحلاقة والتحميم</p>
        </div>
        <button class="btn btn-danger" id="delete-all-data-btn" title="حذف جميع السجلات من قاعدة البيانات">
          🗑️ تصفير كل البيانات
        </button>
      </div>
    `;

    // Period filter
    html += `
      <div class="tab-filter animate-in-delay-1">
        <button class="tab-filter-btn ${this.period === 'today' ? 'active' : ''}" data-period="today">اليوم</button>
        <button class="tab-filter-btn ${this.period === 'week' ? 'active' : ''}" data-period="week">الأسبوع</button>
        <button class="tab-filter-btn ${this.period === 'month' ? 'active' : ''}" data-period="month">الشهر</button>
        <button class="tab-filter-btn ${this.period === 'all' ? 'active' : ''}" data-period="all">الكل</button>
      </div>
    `;

    // Stats cards
    html += `
      <div class="stats-grid animate-in-delay-1">
        <div class="stat-card purple">
          <span class="stat-icon"><img src="assets/alkokh_icons/customers.png" alt="services"></span>
          <div class="stat-value">${stats.total}</div>
          <div class="stat-label">إجمالي الخدمات</div>
        </div>
        <div class="stat-card blue">
          <span class="stat-icon"><img src="assets/alkokh_icons/haircut.png" alt="grooming"></span>
          <div class="stat-value">${stats.grooming}</div>
          <div class="stat-label">حلاقة</div>
        </div>
        <div class="stat-card green">
          <span class="stat-icon"><img src="assets/alkokh_icons/bath.png" alt="bath"></span>
          <div class="stat-value">${stats.bath}</div>
          <div class="stat-label">تحميم</div>
        </div>
        <div class="stat-card gold">
          <span class="stat-icon"><img src="assets/alkokh_icons/customers.png" alt="customers"></span>
          <div class="stat-value">${stats.uniqueCustomers}</div>
          <div class="stat-label">زبائن فريدين</div>
        </div>
      </div>
    `;

    // Charts
    html += `
      <div class="grid-2 animate-in-delay-2">
        <div class="chart-card">
          <div class="chart-title">📈 الأداء الأسبوعي</div>
          <div class="chart-container">
            <canvas id="weekly-chart"></canvas>
          </div>
        </div>
        <div class="chart-card">
          <div class="chart-title">🍩 نسبة الحلاقة مقابل التحميم</div>
          <div class="chart-container">
            <canvas id="ratio-chart"></canvas>
          </div>
        </div>
      </div>
    `;

    // Employee workload chart
    html += `
      <div class="chart-card animate-in-delay-3">
        <div class="chart-title">👤 عدد الحالات لكل موظف</div>
        <div class="chart-container">
          <canvas id="employee-chart"></canvas>
        </div>
      </div>
    `;

    // Employee leaderboard
    html += `
      <div class="chart-card animate-in-delay-3">
        <div class="chart-title">🏆 ترتيب الموظفين</div>
        <div class="leaderboard">
    `;

    const rankClasses = ['gold', 'silver', 'bronze', 'default'];
    stats.employeeStats.forEach((emp, idx) => {
      const maxCount = stats.employeeStats[0]?.count || 1;
      const pct = maxCount > 0 ? Math.round((emp.count / maxCount) * 100) : 0;
      html += `
        <div class="leaderboard-item">
          <div class="leaderboard-rank ${rankClasses[idx] || 'default'}">${idx + 1}</div>
          <div class="employee-avatar" style="background:${emp.avatar_color}">${emp.name_ar.charAt(0)}</div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${emp.name_ar}</div>
            <div class="leaderboard-spec">${emp.specialization === 'groomer' ? 'حلاّق' : 'مُحمِّم'} · ${emp.avgDuration || 0} دقيقة متوسط</div>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>
          <div style="text-align:center;">
            <div class="leaderboard-count">${emp.count}</div>
            <div class="leaderboard-label">خدمة</div>
          </div>
        </div>
      `;
    });

    html += `</div></div>`;

    // WhatsApp notification logs section
    const notifStats = await DB.getNotificationStats();
    const recentLogs = await DB.getRecentNotificationLogs(20, this._logsFilter || 'all');
    html += `
      <div class="section-divider"></div>
      <div class="chart-card animate-in-delay-3">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <div class="chart-title" style="margin:0;">📱 سجل رسائل الواتساب</div>
          <div style="display:flex; gap:8px;">
            <span class="badge badge-success">نجح: ${notifStats.success}</span>
            <span class="badge badge-danger">فشل: ${notifStats.failed}</span>
            <span class="badge badge-warning">قيد الإرسال: ${notifStats.pending}</span>
          </div>
        </div>

        <div class="tab-filter" style="margin-bottom:14px;">
          <button class="tab-filter-btn ${(this._logsFilter||'all')==='all'?'active':''}" data-logs-filter="all">الكل</button>
          <button class="tab-filter-btn ${this._logsFilter==='success'?'active':''}" data-logs-filter="success">ناجحة</button>
          <button class="tab-filter-btn ${this._logsFilter==='failed'?'active':''}" data-logs-filter="failed">فاشلة</button>
          <button class="tab-filter-btn ${this._logsFilter==='pending'?'active':''}" data-logs-filter="pending">قيد الإرسال</button>
        </div>

        <div style="overflow-x:auto;">
          <table class="notif-logs-table" style="width:100%; border-collapse:collapse; font-size:0.88rem;">
            <thead>
              <tr style="background:rgba(0,0,0,0.04);">
                <th style="padding:8px; text-align:right;">الوقت</th>
                <th style="padding:8px; text-align:right;">الزبون</th>
                <th style="padding:8px; text-align:right;">الرقم</th>
                <th style="padding:8px; text-align:right;">النوع</th>
                <th style="padding:8px; text-align:right;">الحالة</th>
                <th style="padding:8px; text-align:right;">المحاولات</th>
                <th style="padding:8px; text-align:right;">الخطأ</th>
                <th style="padding:8px; text-align:right;">إجراء</th>
              </tr>
            </thead>
            <tbody>
    `;

    if (recentLogs.length === 0) {
      html += `<tr><td colspan="8" style="padding:16px; text-align:center; opacity:0.6;">لا توجد سجلات حالياً</td></tr>`;
    } else {
      const eventLabels = {
        booking_confirmation: '✅ حجز',
        task_started: '🚀 بدء العمل',
        task_completed: '🏁 إكمال',
        feedback_request: '⭐ تقييم'
      };
      const statusLabels = {
        success: '<span style="color:#10b981;">✅ نجح</span>',
        failed: '<span style="color:#ef4444;">❌ فشل</span>',
        pending: '<span style="color:#f59e0b;">⏳ قيد الإرسال</span>'
      };
      recentLogs.forEach(log => {
        const dt = new Date(log.created_at).toLocaleString('ar-IQ', { hour12: false });
        const errShort = (log.error_message || '').substring(0, 60);
        html += `
          <tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
            <td style="padding:8px; white-space:nowrap;">${dt}</td>
            <td style="padding:8px;">${log.customer_name || '-'}</td>
            <td style="padding:8px; direction:ltr; text-align:right;">${log.phone}</td>
            <td style="padding:8px;">${eventLabels[log.event_type] || log.event_type}</td>
            <td style="padding:8px;">${statusLabels[log.status] || log.status}</td>
            <td style="padding:8px; text-align:center;">${log.attempt_count || 0}</td>
            <td style="padding:8px; font-size:0.78rem; color:#666; max-width:200px;">${errShort}${errShort.length >= 60 ? '…' : ''}</td>
            <td style="padding:8px;">
              ${log.status === 'failed' ? `<button class="btn btn-sm" data-resend-log="${log.id}">↻ إعادة</button>` : ''}
            </td>
          </tr>
        `;
      });
    }

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Reminder templates section
    html += `
      <div class="section-divider"></div>
      <div class="animate-in-delay-3">
        <div class="chart-title" style="font-size:1.1rem; margin-bottom:20px;">💬 قوالب الرسائل الذكية</div>
        
        <div class="reminder-card">
          <h4>✨ رسالة بعد الخدمة</h4>
          <div class="reminder-text">نعيماً لـ [اسم الحيوان]! 🐾✨
صار يلمع وريحته حلوة!
تذكّر دكتور الكوخ ينصح بتمشيط شعره يومياً للحفاظ على نعومته.
مع تحيات عيادة الكوخ البيطرية 🏠💜</div>
        </div>

        <div class="reminder-card">
          <h4>📅 تذكير ذكي (بعد 4 أسابيع)</h4>
          <div class="reminder-text">أهلاً أستاذ [اسم الزبون] 👋
مرّ شهر على آخر حلاقة لـ [اسم الحيوان].
الشعر بدأ يطول وممكن يتشربك!
تحب نحجز لك موعد تحديث؟ 🐾
عيادة الكوخ البيطرية 🏠💜</div>
        </div>

        <div class="reminder-card">
          <h4>🌡️ تنبيه صحي ذكي (Pet Grooming Health Score)</h4>
          <div class="reminder-text">🌡️ تنبيه صحي ذكي:
بناءً على نوع شعر كلبك ([نوع الشعر]) والجو الحار حالياً في بغداد (٤٥°),
ننصح بتحميم طبي الأسبوع القادم للحفاظ على برودة جسمه وصحة جلده.
تحب نثبت الموعد؟ 💊🛁
عيادة الكوخ البيطرية — نهتم بصحة رفيقك 🏠💜</div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Bind period filter (only top filter, not logs filter)
    container.querySelectorAll('.tab-filter-btn[data-period]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this.period = btn.dataset.period;
        showLoading($('#app'));
        await this._buildUI($('#app'));
      });
    });

    // Bind logs filter
    container.querySelectorAll('[data-logs-filter]').forEach(btn => {
      btn.addEventListener('click', async () => {
        this._logsFilter = btn.dataset.logsFilter;
        showLoading($('#app'));
        await this._buildUI($('#app'));
      });
    });

    // Bind resend buttons
    container.querySelectorAll('[data-resend-log]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const logId = btn.dataset.resendLog;
        btn.disabled = true;
        btn.textContent = '⏳';
        const ok = await DB.resendNotification(logId);
        if (ok) {
          showToast('✅ تم إعادة الإرسال', 'success');
        } else {
          showToast('❌ فشل إعادة الإرسال', 'error');
        }
        showLoading($('#app'));
        await this._buildUI($('#app'));
      });
    });

    // Bind delete all data
    const deleteAllBtn = container.querySelector('#delete-all-data-btn');
    if (deleteAllBtn) {
      deleteAllBtn.addEventListener('click', async () => {
        if (!confirm('⚠️ تحذير خطير: هل أنت متأكد من حذف *جميع* السجلات والطلبات السابقة من قاعدة البيانات بشكل نهائي؟ هذا الإجراء لا يمكن التراجع عنه.')) return;
        if (!confirm('تأكيد أخير: حذف كل البيانات؟')) return;
        
        deleteAllBtn.disabled = true;
        deleteAllBtn.textContent = 'جاري الحذف...';
        
        await DB.deleteAllOrders();
        showToast('تم تصفير جميع السجلات بنجاح 🗑️', 'success');
        
        showLoading($('#app'));
        await this._buildUI($('#app'));
      });
    }

    // Render charts after DOM is ready
    requestAnimationFrame(() => {
      this._renderCharts(stats, weeklyData);
    });
  },

  _renderCharts(stats, weeklyData) {
    // Destroy existing charts
    Object.values(this.charts).forEach(c => c.destroy?.());
    this.charts = {};

    const chartFont = { family: "'Tajawal', sans-serif" };

    // Weekly performance chart
    const weeklyCtx = document.getElementById('weekly-chart');
    if (weeklyCtx) {
      this.charts.weekly = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
          labels: weeklyData.labels,
          datasets: [
            {
              label: 'حلاقة',
              data: weeklyData.groomingData,
              backgroundColor: 'rgba(192, 38, 211, 0.7)',
              borderColor: 'rgba(192, 38, 211, 1)',
              borderWidth: 1,
              borderRadius: 6,
            },
            {
              label: 'تحميم',
              data: weeklyData.bathData,
              backgroundColor: 'rgba(16, 185, 129, 0.7)',
              borderColor: 'rgba(16, 185, 129, 1)',
              borderWidth: 1,
              borderRadius: 6,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { ...chartFont, weight: '600' }, padding: 16 }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: chartFont },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            x: {
              ticks: { font: chartFont },
              grid: { display: false }
            }
          }
        }
      });
    }

    // Ratio donut chart
    const ratioCtx = document.getElementById('ratio-chart');
    if (ratioCtx) {
      const hasData = stats.grooming > 0 || stats.bath > 0;
      this.charts.ratio = new Chart(ratioCtx, {
        type: 'doughnut',
        data: {
          labels: ['حلاقة', 'تحميم'],
          datasets: [{
            data: hasData ? [stats.grooming, stats.bath] : [1, 1],
            backgroundColor: [
              'rgba(192, 38, 211, 0.8)',
              'rgba(16, 185, 129, 0.8)'
            ],
            borderColor: ['#fff', '#fff'],
            borderWidth: 3,
            hoverOffset: 10,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { font: { ...chartFont, weight: '600' }, padding: 20 }
            }
          }
        }
      });
    }

    // Employee workload bar chart
    const empCtx = document.getElementById('employee-chart');
    if (empCtx) {
      this.charts.employee = new Chart(empCtx, {
        type: 'bar',
        data: {
          labels: stats.employeeStats.map(e => e.name_ar),
          datasets: [{
            label: 'عدد الخدمات',
            data: stats.employeeStats.map(e => e.count),
            backgroundColor: stats.employeeStats.map(e => e.avatar_color + 'CC'),
            borderColor: stats.employeeStats.map(e => e.avatar_color),
            borderWidth: 2,
            borderRadius: 8,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: chartFont },
              grid: { color: 'rgba(0,0,0,0.05)' }
            },
            y: {
              ticks: { font: { ...chartFont, weight: '700', size: 14 } },
              grid: { display: false }
            }
          }
        }
      });
    }
  }
};


// ==========================================
// AUTO-REFRESH (Operator view auto-updates)
// ==========================================
let autoRefreshInterval = null;
let _lastWaitingCount = 0;

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    if (Router.currentView === 'operator' && Auth.isAuthenticated()) {
      try {
        const orders = await DB.getOrders();
        const actualWaiting = orders.filter(o => o.status === 'waiting').length;

        if (actualWaiting > _lastWaitingCount && _lastWaitingCount > 0) {
          playNotificationSound();
          showToast('🆕 طلب جديد في قائمة الانتظار!', 'info');
          await OperatorView._buildUI($('#app'));
          OperatorView._startTimers();
        }
        _lastWaitingCount = actualWaiting;
      } catch (err) {
        console.warn('Auto-refresh error:', err);
      }
    }
  }, 5000);
}


// ==========================================
// BACKGROUND ANIMATION
// ==========================================
function initAnimatedBackground() {
  const container = document.getElementById('animated-bg');
  if (!container) return;

  const pawSvg = `<svg viewBox="0 0 200 220" width="100%" height="100%" fill="var(--white)" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 155 C100 155 70 130 70 115 C70 105 78 98 88 98 C93 98 97 100 100 104 C103 100 107 98 112 98 C122 98 130 105 130 115 C130 130 100 155 100 155Z"/>
    <ellipse cx="75" cy="92" rx="11" ry="13"/>
    <ellipse cx="125" cy="92" rx="11" ry="13"/>
    <ellipse cx="93" cy="78" rx="9" ry="11"/>
    <ellipse cx="107" cy="78" rx="9" ry="11"/>
  </svg>`;

  const particleCount = 20;
  for (let i = 0; i < particleCount; i++) {
    const paw = document.createElement('div');
    paw.className = 'floating-paw';
    paw.innerHTML = pawSvg;
    
    const size = Math.random() * 40 + 30;
    const left = Math.random() * 100;
    const duration = Math.random() * 20 + 25;
    const delay = Math.random() * -40;
    const opacity = Math.random() * 0.05 + 0.02;
    const rotStart = Math.random() * 360;
    const rotEnd = rotStart + (Math.random() > 0.5 ? 1 : -1) * (Math.random() * 180 + 90);
    const scale = Math.random() * 0.5 + 0.8;
    
    paw.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}vw;
      --duration: ${duration}s;
      --delay: ${delay}s;
      --opacity: ${opacity};
      --rot-start: ${rotStart}deg;
      --rot-end: ${rotEnd}deg;
      --scale: ${scale};
    `;
    
    container.appendChild(paw);
  }
}


// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize auth first
  await Auth.init();

  // Initialize router
  Router.init();

  // Initialize animated background
  initAnimatedBackground();

  // Start auto-refresh
  startAutoRefresh();

  console.log('%c🐾 عيادة الكوخ البيطرية — نظام الحلاقة والتحميم', 'font-size:16px; font-weight:bold; color:#C026D3;');
  console.log('%c🔐 نظام المصادقة: Supabase Auth', 'font-size:12px; color:#10B981;');
  console.log('%c💾 قاعدة البيانات: Supabase PostgreSQL', 'font-size:12px; color:#3B82F6;');
});
