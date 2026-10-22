/* One authoritative public deployment input. Owner ID is a UX check only;
   actual admission still requires Auth + owner registry + AAL2 on the server. */
import '../../../js/environment-config.js';
import '../../../js/environment.js';
export const environmentStatus = globalThis.PortfolioEnvironment.status();
const config = environmentStatus.config;
export const SUPABASE_URL = config?.url || '';
export const SUPABASE_PUBLISHABLE_KEY = config?.key || '';
export const OWNER_USER_ID = config?.owner || '';
export const IS_LOCAL_ADMIN = ['local', 'fixture'].includes(config?.environment);
