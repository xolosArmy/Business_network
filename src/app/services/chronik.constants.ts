import { environment } from '../../environments/environment';

const normalizedBase = environment.CHRONIK_BASE?.replace(/\/+$/, '') || '/chronik/xec';

export const CHRONIK_URL = normalizedBase;
export const CHRONIK_FALLBACK_URLS: readonly string[] = [CHRONIK_URL];
export const RMZ_TOKEN_ID = '9e0a9d4720782cf661beaea6c5513f1972e0f3b1541ba4c83f4c87ef65f843dc';
