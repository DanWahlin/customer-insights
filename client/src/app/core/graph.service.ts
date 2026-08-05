import { Injectable, signal } from '@angular/core';
import {
  AccountInfo,
  PublicClientApplication
} from '@azure/msal-browser';
import { Client } from '@microsoft/microsoft-graph-client';
import {
  DriveItem,
  Event as GraphEvent,
  Message,
  User
} from '@microsoft/microsoft-graph-types';
import { TeamsDialogData } from '../textarea-dialog/dialog-data';
import { FeatureFlagsService } from './feature-flags.service';
import { ChatMessage, ChatMessageInfo } from '@shared/interfaces';
import { environment } from '../../environments/environment';

const GRAPH_SCOPES = [
  'User.Read',
  'Files.Read.All',
  'Mail.Read',
  'Calendars.Read',
  'Chat.Read',
  'ChannelMessage.Read.All',
  'ChannelMessage.Send'
];
const API_SCOPE = environment.ENTRAID_API_SCOPE;

@Injectable({
  providedIn: 'root'
})
export class GraphService {
  private msal?: PublicClientApplication;
  private graphClient?: Client;
  private initialization?: Promise<User | null>;
  private readonly signedIn = signal(false);
  private readonly currentUserState = signal<User | null>(null);

  readonly isSignedIn = this.signedIn.asReadonly();
  readonly currentUser = this.currentUserState.asReadonly();

  constructor(private featureFlags: FeatureFlagsService) { }

  async init(): Promise<User | null> {
    if (!this.featureFlags.microsoft365Enabled) return null;
    return this.initialization ??= this.initialize();
  }

  private async initialize(): Promise<User | null> {
    this.msal = new PublicClientApplication({
      auth: {
        clientId: environment.ENTRAID_CLIENT_ID,
        authority: `https://login.microsoftonline.com/${environment.ENTRAID_TENANT_ID || 'organizations'}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin
      },
      cache: {
        cacheLocation: 'sessionStorage'
      }
    });
    await this.msal.initialize();

    const redirectResult = await this.msal.handleRedirectPromise();
    const account = redirectResult?.account ?? this.msal.getActiveAccount() ?? this.msal.getAllAccounts()[0];
    if (!account) return null;

    this.msal.setActiveAccount(account);
    this.initGraphClient();
    try {
      const user = await this.getMe();
      await this.getApiAccessToken();
      this.currentUserState.set(user);
      this.signedIn.set(true);
      return user;
    } catch (error) {
      console.warn('A cached Microsoft account requires an interactive sign-in.', error);
      this.graphClient = undefined;
      this.currentUserState.set(null);
      this.signedIn.set(false);
      return null;
    }
  }

  loggedIn(): boolean {
    return this.signedIn();
  }

  async login(): Promise<User> {
    await this.init();
    const msal = this.requireMsal();
    const result = await msal.loginPopup({ scopes: GRAPH_SCOPES });
    msal.setActiveAccount(result.account);
    this.initGraphClient();
    try {
      const user = await this.getMe();
      await this.getApiAccessToken();
      this.currentUserState.set(user);
      this.signedIn.set(true);
      return user;
    } catch (error) {
      this.graphClient = undefined;
      this.currentUserState.set(null);
      this.signedIn.set(false);
      throw error;
    }
  }

  async logout(): Promise<void> {
    const msal = this.requireMsal();
    const account = msal.getActiveAccount();
    try {
      await msal.logoutPopup({
        account,
        postLogoutRedirectUri: window.location.origin,
        mainWindowRedirectUri: window.location.origin
      });
    }
    finally {
      this.graphClient = undefined;
      this.currentUserState.set(null);
      this.signedIn.set(false);
    }
  }

  async getMe(): Promise<User> {
    return this.requireGraphClient().api('/me').select('id,displayName,mail,userPrincipalName').get();
  }

  async getApiAccessToken(): Promise<string> {
    if (!API_SCOPE) throw new Error('The Customer Insights API scope is not configured.');
    const msal = this.requireMsal();
    const account = this.requireAccount(msal.getActiveAccount() ?? msal.getAllAccounts()[0]);
    const result = await msal.acquireTokenSilent({ account, scopes: [API_SCOPE] });
    return result.accessToken;
  }

  async searchFiles(query: string): Promise<DriveItem[]> {
    if (!query) return [];

    const body = {
      requests: [{
        entityTypes: ['driveItem'],
        query: { queryString: `${query} AND ContentType:Document` },
        from: 0,
        size: 25,
        fields: ['id', 'name', 'webUrl', 'size', 'createdDateTime', 'lastModifiedDateTime', 'createdBy', 'lastModifiedBy']
      }]
    };

    const response = await this.requireGraphClient().api('/search/query').post(body);
    return this.extractSearchHits<DriveItem>(response).map(hit => hit.resource);
  }

  async searchChatMessages(query: string): Promise<ChatMessage[]> {
    if (!query) return [];

    const body = {
      requests: [{
        entityTypes: ['chatMessage'],
        query: { queryString: query },
        from: 0,
        size: 25
      }]
    };

    const response = await this.requireGraphClient().api('/search/query').post(body);
    const hits = this.extractSearchHits<any>(response);
    const messageInfo: ChatMessageInfo[] = hits.map(hit => ({
      teamId: hit.resource.channelIdentity?.teamId,
      channelId: hit.resource.channelIdentity?.channelId,
      chatId: hit.resource.chatId,
      messageId: hit.resource.id,
      summary: this.stripGraphHighlighting(hit.summary ?? '')
    }));

    const results = await Promise.allSettled(messageInfo.map(info => {
      const path = info.teamId && info.channelId
        ? `/teams/${this.encodePathSegment(info.teamId)}/channels/${this.encodePathSegment(info.channelId)}/messages/${this.encodePathSegment(info.messageId)}`
        : `/chats/${this.encodePathSegment(info.chatId ?? '')}/messages/${this.encodePathSegment(info.messageId)}`;
      return this.requireGraphClient().api(path).get();
    }));

    return results.flatMap((result, index) => {
      if (result.status !== 'fulfilled') return [];
      const message = result.value;
      const info = messageInfo[index];
      return [{
        id: message.id,
        teamId: message.channelIdentity?.teamId ?? info.teamId ?? '',
        channelId: message.channelIdentity?.channelId ?? info.channelId ?? '',
        chatId: message.chatId ?? info.chatId,
        summary: info.summary,
        body: message.body?.content ?? '',
        from: message.from?.user?.displayName ?? message.from?.application?.displayName ?? 'Unknown',
        date: message.createdDateTime ?? '',
        webUrl: message.webUrl ?? ''
      }];
    });
  }

  async searchEmailMessages(query: string): Promise<Message[]> {
    if (!query) return [];

    const response = await this.requireGraphClient()
      .api('/me/messages')
      .search(`"${query.replaceAll('"', '\\"')}"`)
      .select('subject,bodyPreview,from,toRecipients,receivedDateTime,webLink')
      .top(25)
      .get();
    return response.value ?? [];
  }

  async searchCalendarEvents(query: string): Promise<GraphEvent[]> {
    if (!query) return [];

    const startDateTime = new Date();
    const endDateTime = new Date(startDateTime.getTime() + (7 * 24 * 60 * 60 * 1000));
    const escapedQuery = query.replaceAll("'", "''");
    const response = await this.requireGraphClient()
      .api('/me/calendarView')
      .header('Prefer', 'outlook.timezone="UTC"')
      .query({
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        '$filter': `contains(subject,'${escapedQuery}')`,
        '$orderby': 'start/dateTime'
      })
      .select('id,subject,bodyPreview,start,end,isAllDay,location,attendees,isOnlineMeeting,onlineMeeting,webLink')
      .top(25)
      .get();
    return response.value ?? [];
  }

  async sendTeamsChat(message: string): Promise<TeamsDialogData> {
    if (!message) throw new Error('No message to send.');
    if (!environment.TEAM_ID || !environment.CHANNEL_ID) {
      throw new Error('Team ID or Channel ID is not set. Add TEAM_ID and CHANNEL_ID to the .env file.');
    }

    const url = `/teams/${this.encodePathSegment(environment.TEAM_ID)}/channels/${this.encodePathSegment(environment.CHANNEL_ID)}/messages`;
    const response = await this.requireGraphClient().api(url).post({
      body: {
        contentType: 'text',
        content: message
      }
    });

    return {
      id: response.id,
      teamId: response.channelIdentity?.teamId ?? environment.TEAM_ID,
      channelId: response.channelIdentity?.channelId ?? environment.CHANNEL_ID,
      message: response.body?.content ?? message,
      webUrl: response.webUrl,
      title: 'Send Teams Chat'
    };
  }

  private initGraphClient(): void {
    this.graphClient = Client.init({
      authProvider: async done => {
        try {
          done(null, await this.getAccessToken());
        } catch (error) {
          done(error as Error, null);
        }
      }
    });
  }

  private async getAccessToken(): Promise<string> {
    const msal = this.requireMsal();
    const account = this.requireAccount(msal.getActiveAccount() ?? msal.getAllAccounts()[0]);
    const result = await msal.acquireTokenSilent({ account, scopes: GRAPH_SCOPES });
    return result.accessToken;
  }

  private requireMsal(): PublicClientApplication {
    if (!this.msal) throw new Error('Microsoft authentication has not been initialized.');
    return this.msal;
  }

  private requireAccount(account?: AccountInfo): AccountInfo {
    if (!account) throw new Error('Sign in to access Microsoft 365 data.');
    return account;
  }

  private requireGraphClient(): Client {
    if (!this.graphClient) throw new Error('Sign in to access Microsoft Graph.');
    return this.graphClient;
  }

  private extractSearchHits<T>(response: any): Array<{ resource: T; summary?: string }> {
    return (response?.value ?? []).flatMap((item: any) =>
      (item.hitsContainers ?? []).flatMap((container: any) => container.hits ?? [])
    );
  }

  private stripGraphHighlighting(summary: string): string {
    return summary.replace(/<\/?c\d+>/gi, '');
  }

  private encodePathSegment(value: string): string {
    try {
      return encodeURIComponent(decodeURIComponent(value));
    } catch {
      return encodeURIComponent(value);
    }
  }
}
