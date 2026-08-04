import { Injectable } from "@angular/core";
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FeatureFlagsService {
    microsoft365Enabled = (environment.ENTRAID_CLIENT_ID) ? true : false;
    acsPhoneEnabled = (environment.ACS_PHONE_NUMBER) ? true : false;
    acsEmailEnabled = environment.ACS_EMAIL_ADDRESS;
    aiEnabled = environment.AI_ENABLED;
    foundryIQEnabled = environment.FOUNDRY_IQ_ENABLED;
    teamsEnabled = environment.TEAMS_ENABLED;
}