import { ChangeDetectionStrategy, Component, EventEmitter, inject, OnDestroy, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { EventBusService, Events } from '@core/eventbus.service';
import { FeatureFlagsService } from '@core/feature-flags.service';
import { GraphService } from '@core/graph.service';
import { User } from '@microsoft/microsoft-graph-types';
import { Phone } from '@shared/interfaces';
import { Subscription } from 'rxjs';
import { ChatHelpDialogComponent } from '../chat-help-dialog/chat-help-dialog.component';
import { PhoneCallComponent } from '../phone-call/phone-call.component';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
  imports: [MatToolbarModule, MatIconModule, MatButtonModule, MatMenuModule, PhoneCallComponent],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Output() userLoggedIn = new EventEmitter<User>();

  callVisible = false;
  callData = {} as Phone;
  subscription = new Subscription();
  dialog = inject(MatDialog);
  eventBus = inject(EventBusService);
  featureFlags = inject(FeatureFlagsService);
  graphService = inject(GraphService);

  ngOnInit() {
    this.subscription.add(
      this.eventBus.on(Events.CustomerCall, (data: Phone) => {
        this.callVisible = true;
        this.callData = data;
      })
    );
  }

  async login() {
    try {
      this.userLoggedIn.emit(await this.graphService.login());
    } catch (error) {
      console.error('Microsoft sign-in failed:', error);
    }
  }

  async logout() {
    await this.graphService.logout();
  }

  accountName(): string {
    return this.graphService.currentUser()?.displayName?.trim() || 'Microsoft 365 user';
  }

  accountEmail(): string {
    const user = this.graphService.currentUser();
    return user?.mail?.trim() || user?.userPrincipalName?.trim() || '';
  }

  accountInitials(): string {
    const words = this.accountName().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || 'M';
  }

  hangup() {
    this.callVisible = false;
  }

  openChatHelp() {
    if (!this.graphService.isSignedIn()) {
      return;
    }
    if (!this.featureFlags.foundryIQEnabled) {
      alert('Document chat is not configured.');
      return;
    }

    const dialogRef = this.dialog.open(ChatHelpDialogComponent, {
      width: '720px',
      maxWidth: 'calc(100vw - 24px)'
    });
    this.subscription.add(dialogRef.afterClosed().subscribe(response => {
      console.log('Chat Help dialog closed:', response);
    }));
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
