import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Load env variables so they're available in server middleware
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      host: true,
      port: 5173,
    },
    plugins: [
      {
        name: 'whatsapp-api-proxy',
        configureServer(server) {

          // ==========================================
          // JT-BOT Webhook Endpoint (PRIMARY)
          // يرسل الإشعارات عبر JT-BOT لجميع الأرقام
          // ==========================================
          server.middlewares.use('/api/whatsapp/webhook', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const { phone, customer_name, service_name, pet_name, event_type } = JSON.parse(body);

                if (!phone) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Phone number is required' }));
                  return;
                }

                // Format phone number (E.164 without +)
                let formattedPhone = phone.replace(/[\s\-\+]/g, '');
                if (formattedPhone.startsWith('07')) {
                  formattedPhone = '964' + formattedPhone.substring(1);
                } else if (!formattedPhone.startsWith('964')) {
                  formattedPhone = '964' + formattedPhone;
                }

                // JT-BOT Webhook URL
                const WEBHOOK_URL = env.JTBOT_WEBHOOK_URL || 'https://jt-b.com/webhook/whatsapp-workflow/270728.366423.354554.1776273183';

                console.log(`📤 Sending WhatsApp via JT-BOT to ${formattedPhone} [${event_type || 'booking'}]...`);

                const params = new URLSearchParams();
                params.append('phone', formattedPhone);
                params.append('customer_name', customer_name || '');
                params.append('service_name', service_name || '');
                params.append('pet_name', pet_name || '');
                params.append('event_type', event_type || 'booking_confirmation');

                const response = await fetch(WEBHOOK_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                  body: params.toString()
                });

                res.setHeader('Content-Type', 'application/json');

                if (response.ok) {
                  console.log(`✅ JT-BOT webhook sent successfully to ${formattedPhone}`);
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, method: 'jtbot_webhook' }));
                } else {
                  const errText = await response.text();
                  console.error(`❌ JT-BOT webhook error:`, errText);
                  res.statusCode = response.status;
                  res.end(JSON.stringify({ success: false, error: errText }));
                }

              } catch (err) {
                console.error('JT-BOT webhook proxy error:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          });

          // ==========================================
          // Meta Cloud API Endpoint (BACKUP/LEGACY)
          // يستخدم فقط إذا تم تسجيل الرقم مع Cloud API مستقبلاً
          // ==========================================
          server.middlewares.use('/api/whatsapp/send', async (req, res) => {
            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method not allowed' }));
              return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                const { to, type, message, template_name, template_params } = JSON.parse(body);

                if (!to) {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Phone number (to) is required' }));
                  return;
                }

                // Format phone number for WhatsApp API (E.164 without +)
                let phone = to.replace(/[\s\-\+]/g, '');
                // If starts with 0, assume Iraqi number
                if (phone.startsWith('07')) {
                  phone = '964' + phone.substring(1);
                } else if (!phone.startsWith('964')) {
                  phone = '964' + phone;
                }

                const PHONE_ID = env.WHATSAPP_PHONE_ID;
                const TOKEN = env.WHATSAPP_ACCESS_TOKEN;

                if (!PHONE_ID || !TOKEN) {
                  console.error('❌ WhatsApp credentials missing from .env');
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'WhatsApp credentials not configured' }));
                  return;
                }

                let payload;

                if (type === 'template') {
                  // Template message (for business-initiated conversations)
                  payload = {
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'template',
                    template: {
                      name: template_name || 'hello_world',
                      language: { code: (template_name === 'hello_world' || !template_name) ? 'en_US' : 'ar' },
                      components: template_params || []
                    }
                  };
                } else {
                  // Text message (for within 24-hour conversation window)
                  payload = {
                    messaging_product: 'whatsapp',
                    to: phone,
                    type: 'text',
                    text: { body: message }
                  };
                }

                const apiUrl = `https://graph.facebook.com/v21.0/${PHONE_ID}/messages`;

                console.log(`📤 Sending WhatsApp to ${phone}...`);

                const response = await fetch(apiUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${TOKEN}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload)
                });

                const data = await response.json();

                res.setHeader('Content-Type', 'application/json');

                if (response.ok) {
                  console.log(`✅ WhatsApp message sent to ${phone}`, data);
                  res.statusCode = 200;
                  res.end(JSON.stringify({ success: true, data }));
                } else {
                  console.error(`❌ WhatsApp API error:`, JSON.stringify(data, null, 2));
                  res.statusCode = response.status;
                  res.end(JSON.stringify({ success: false, error: data }));
                }

              } catch (err) {
                console.error('WhatsApp proxy error:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          });
        }
      }
    ]
  };
});
