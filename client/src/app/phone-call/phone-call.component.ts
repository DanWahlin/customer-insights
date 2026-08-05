import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { CallClient, CallAgent, Call } from "@azure/communication-calling";
import { AzureCommunicationTokenCredential } from '@azure/communication-common';
import { Subscription } from 'rxjs';
import { AcsUser } from '@shared/interfaces';
import { AcsService } from '@core/acs.service';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments/environment';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
    selector: 'app-phone-call',
    templateUrl: './phone-call.component.html',
    styleUrls: ['./phone-call.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule]
})
export class PhoneCallComponent implements OnInit, OnDestroy {
  inCall = false;
  initializing = false;
  error = '';
  call: Call | undefined;
  callClient: CallClient | undefined;
  callAgent: CallAgent | undefined;
  fromNumber = environment.ACS_PHONE_NUMBER; // From .env file
  dialerVisible = false;
  numbers: string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', '0', 'backspace'];
  cursorPosition = 0;
  subscription = new Subscription();
  private destroyed = false;
  private initializationGeneration = 0;

  @Input() customerPhoneNumber = '';
  @Output() hangup = new EventEmitter();

  @ViewChild('phoneInput', { static: false }) phoneInput: ElementRef | null = null;
  @ViewChild('dialer', { static: false }) dialer: ElementRef | null = null;

  acsService = inject(AcsService);

  async ngOnInit() {
    if (environment.ACS_CONNECTION_STRING) {
      this.initializing = true;
      this.subscription.add(
        this.acsService.getAcsToken().subscribe({
          next: user => {
            if (!this.destroyed) void this.initializeCallAgent(user);
          },
          error: () => {
            if (this.destroyed) return;
            this.initializing = false;
            this.error = 'Calling could not be prepared. Close this panel and try again.';
          }
        })
      );
    }
  }

  private async initializeCallAgent(user: AcsUser) {
    const generation = ++this.initializationGeneration;
    const callClient = new CallClient();
    try {
      const tokenCredential = new AzureCommunicationTokenCredential(user.token);
      const callAgent = await callClient.createCallAgent(tokenCredential);
      if (this.destroyed || generation !== this.initializationGeneration) {
        await callClient.dispose().catch(() => undefined);
        return;
      }
      this.callClient = callClient;
      this.callAgent = callAgent;
    }
    catch {
      await callClient.dispose().catch(() => undefined);
      if (!this.destroyed && generation === this.initializationGeneration) {
        this.error = 'Calling could not be prepared. Close this panel and try again.';
      }
    }
    finally {
      if (!this.destroyed && generation === this.initializationGeneration) {
        this.initializing = false;
      }
    }
  }

  showDialer() {
    this.dialerVisible = true;
    this.cursorPosition = this.phoneInput?.nativeElement.selectionStart;
  }

  addNumber(num: string): void {
    if (num.trim() && this.phoneInput?.nativeElement.value.length < 20) {
      const position = this.cursorPosition !== undefined ? this.cursorPosition : this.customerPhoneNumber.length;
      this.customerPhoneNumber = this.customerPhoneNumber.slice(0, position) + num + this.customerPhoneNumber.slice(position);
      this.cursorPosition += 1;
    }
  }

  removeNumber(): void {
    const position = this.cursorPosition || this.customerPhoneNumber.length;
    if (position < 1) return;

    this.customerPhoneNumber = this.customerPhoneNumber.slice(0, position - 1) + this.customerPhoneNumber.slice(position);
    this.cursorPosition = position - 1;
  }

  startCall() {
    this.dialerVisible = false;
    if (!this.callAgent || !this.customerPhoneNumber.trim()) {
      this.error = 'Calling is not ready yet.';
      return;
    }

    this.error = '';
    try {
      this.call = this.callAgent.startCall(
        [{ phoneNumber: this.customerPhoneNumber }], {
        alternateCallerId: { phoneNumber: this.fromNumber }
      });
    }
    catch {
      this.error = 'The call could not be started. Check the number and try again.';
      return;
    }
    console.log('Calling: ', this.customerPhoneNumber);
    console.log('Call id: ', this.call?.id);
    this.inCall = true;

    // Adding event handlers to monitor call state
    this.call?.on('stateChanged', this.callStateChanged);
  }

  private callStateChanged = () => {
      console.log('Call state changed: ', this.call?.state);
      if (this.call?.state === 'Disconnected') {
        console.log('Call ended. Reason: ', this.call.callEndReason);
        this.call.off('stateChanged', this.callStateChanged);
        this.call = undefined;
        this.inCall = false;
      }
  };

  async endCall() {
    this.dialerVisible = false;
    if (this.call) {
      const activeCall = this.call;
      try {
        await activeCall.hangUp({ forEveryone: true });
      }
      catch {
        this.error = 'The call could not be ended. Try again.';
        return;
      }
      activeCall.off('stateChanged', this.callStateChanged);
      this.call = undefined;
      this.inCall = false;
    }
    else {
      this.hangup.emit();
    }
  }

  // Handle closing content options menu when they click anywhere in the document
  @HostListener('document:click', ['$event'])
  documentClick(e: Event) {
    const targetElement = e.target as HTMLElement;
    if (this.dialerVisible && targetElement !== this.phoneInput?.nativeElement &&
      (!this.dialer || !this.dialer.nativeElement.contains(targetElement))
    ) {
      this.dialerVisible = false;
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.initializationGeneration += 1;
    this.subscription.unsubscribe();
    const activeCall = this.call;
    this.call = undefined;
    const callClient = this.callClient;
    this.callClient = undefined;
    this.callAgent = undefined;
    void (async () => {
      if (activeCall) {
        activeCall.off('stateChanged', this.callStateChanged);
        await activeCall.hangUp({ forEveryone: true }).catch(error => console.warn('Call cleanup failed:', error));
      }
      if (callClient) {
        await callClient.dispose().catch(error => console.warn('Calling client cleanup failed:', error));
      }
    })();
  }

}
