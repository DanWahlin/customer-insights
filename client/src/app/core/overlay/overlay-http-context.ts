import { HttpContextToken } from '@angular/common/http';

export const SKIP_GLOBAL_OVERLAY = new HttpContextToken<boolean>(() => false);
