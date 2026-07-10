export const environment = {
  production: true,
  supabaseUrl: 'https://gakvktwtdunljojghpff.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdha3ZrdHd0ZHVubGpvamdocGZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxODY1NzgsImV4cCI6MjA5Mzc2MjU3OH0.yiGHqFIfDyByHBl_7zyHFsClAtXmYggYiSjBb8qo3bU',
  sentryDsn: 'https://52153d44379bda28bed8d9a2868f260b@o4511458808561664.ingest.us.sentry.io/4511458868920320',
  // Public key do Mercado Pago (frontend-safe, produção). Usada pelo SDK v2
  // para montar o Payment Brick do checkout embutido.
  mercadoPagoPublicKey: 'APP_USR-3550a65c-abb1-432d-b87e-50082a4b449f',
};
