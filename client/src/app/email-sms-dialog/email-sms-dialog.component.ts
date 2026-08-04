import { Component, OnDestroy, OnInit, ViewChild, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTabGroup, MatTabsModule } from '@angular/material/tabs';
import { Subscription } from 'rxjs';
import { DataService } from '@core/data.service';
import { AcsService } from '@core/acs.service';
import { FeatureFlagsService } from '@core/feature-flags.service';
import { EmailSmsDialogData } from './email-sms-dialog-data';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';


@Component({
    selector: 'app-email-sms-dialog',
    templateUrl: './email-sms-dialog.component.html',
    styleUrls: ['./email-sms-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogModule, MatIconModule, MatTabsModule, FormsModule, MatButtonModule]
})
export class EmailSmsDialogComponent implements OnInit, OnDestroy {
  title = '';
  prompt = '';
  emailSubject = '';
  emailBody = '';
  emailAddress = '';
  error = '';
  smsMessage = '';
  emailSent = false;
  smsSent = false;
  placeholder = `Example: 
Order is delayed 2 days. 
5% discount off order. 
We're sorry.`
  subscription = new Subscription();

  dataService = inject(DataService);
  acsService = inject(AcsService);
  dialogRef = inject(MatDialogRef<EmailSmsDialogComponent>);
  featureFlags = inject(FeatureFlagsService);
  data: EmailSmsDialogData = inject(MAT_DIALOG_DATA);

  @ViewChild('tabgroup', { static: true }) tabGroup!: MatTabGroup;

  ngOnInit() {
    this.title = this.data instanceof Error ? '' : this.data.title;
  }

  getFirstName(customerName: string) {
    if (customerName && customerName.indexOf(' ') > -1) {
      return customerName.split(' ')[0];
    }
    return customerName;
  }

  async generateEmailSmsMessages() {
    this.error = '';
    
    this.subscription.add(
      this.dataService.completeEmailSmsMessages(this.prompt, this.data.company, this.getFirstName(this.data.customerName))
        .subscribe((data) => {
          if (data.status) {
            this.emailSubject = data.emailSubject;
            this.emailBody = data.emailBody;
            this.smsMessage = data.sms;
            this.tabGroup.selectedIndex = 1;
          }
          else {
            this.error = data.error;
          }
        })
    );
  }

  sendEmail() {
    if (this.featureFlags.acsEmailEnabled) {
      this.subscription.add(
        this.acsService.sendEmail(this.emailSubject, this.emailBody, 
            this.getFirstName(this.data.customerName), this.data.customerEmailAddress)
          .subscribe({
            next: res => {
              if (res.status) this.emailSent = true;
            },
            error: error => {
              this.error = error?.error?.message ?? 'Email delivery failed.';
            }
          })
      );
    }
    else {
      this.error = 'Azure Communication Services email is not configured.';
    }
  }

  sendSms() {
    if (this.featureFlags.acsPhoneEnabled) {
      this.subscription.add(
        this.acsService.sendSms(this.smsMessage, this.data.customerPhoneNumber)
          .subscribe({
            next: res => {
              if (res.status) this.smsSent = true;
            },
            error: error => {
              this.error = error?.error?.message ?? 'SMS delivery failed.';
            }
          })
      );
    }
    else {
      this.error = 'Azure Communication Services SMS is not configured.';
    }
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

}
