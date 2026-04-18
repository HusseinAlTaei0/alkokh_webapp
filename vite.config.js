import { defineConfig } from 'vite';

// ==========================================
// ملاحظة: تم نقل إرسال الواتساب إلى Supabase Edge Function (send-whatsapp)
// السجلات تُحفظ في جدول notification_logs، والرسائل المجدولة (feedback)
// تُدار عبر pg_cron + process-pending-notifications.
//
// لو احتجت رجوع سريع لبروكسي vite، كان موجود بنسخ Git السابقة.
// ==========================================

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
});
