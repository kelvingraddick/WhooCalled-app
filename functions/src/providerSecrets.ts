import {defineSecret} from 'firebase-functions/params';

// These declarations reserve stable secret names without creating, reading, or
// attaching any provider credentials to deployed functions.
export const trestleApiKey = defineSecret('TRESTLE_API_KEY');
export const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
export const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
export const braveSearchApiKey = defineSecret('BRAVE_SEARCH_API_KEY');
