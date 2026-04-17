/* =============================================
   SUPABASE CONFIGURATION
   ⚠️ الـ publishable key آمنة للاستخدام بالمتصفح
   الحماية الحقيقية تأتي من RLS policies بقاعدة البيانات
   ============================================= */

const SUPABASE_URL = 'https://hvvogxljniihayalgdvm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_h93ykLl9F3IXO4K-3TXe1w_wmllFy4_';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
