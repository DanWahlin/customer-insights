
import { Component, EventEmitter, OnDestroy, OnInit, Output, inject, ChangeDetectionStrategy } from '@angular/core';

import { SorterService } from '@core/sorter.service';
import { EventBusService, Events } from '@core/eventbus.service';
import { DataService } from '@core/data.service';
import { MatDialog } from '@angular/material/dialog';
import { PhonePipe } from '../shared/phone.pipe';
import { EmailSmsDialogData } from '../email-sms-dialog/email-sms-dialog-data';
import { EmailSmsDialogComponent } from '../email-sms-dialog/email-sms-dialog.component';
import { Subscription } from 'rxjs';
import { FeatureFlagsService } from '@core/feature-flags.service';
import { Phone } from '../shared/interfaces';
import { DynamicPipe } from '../shared/dynamic.pipe';
import { TitleCaseUnderscorePipe } from '../shared/titlecase-underscore.pipe';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { FilterTextboxComponent } from '../shared/filter-textbox.component';
import { MatIconModule } from '@angular/material/icon';
import { NgTemplateOutlet } from '@angular/common';

@Component({
    selector: 'app-customers-list',
    templateUrl: './customers-list.component.html',
    styleUrls: ['./customers-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatIconModule, FilterTextboxComponent, MatButtonModule,
        MatMenuModule, FormsModule, TitleCaseUnderscorePipe, DynamicPipe, NgTemplateOutlet]
})
export class CustomersListComponent implements OnInit, OnDestroy {
    // Due to dynamic OpenAI query we're going with any[] for type of the data property
    private _data: any[] = [];
    get data(): any[] {
        return this._data;
    }
    set data(value: any[]) {
        if (value) {
            this.filteredData = this._data = value;
            if (value.length > 0) {
                const headers = Object.keys(this.data[0]);
                // filter out id property
                this.headers = headers.filter((h: string) => h !== 'id');
            }
        }
    }
    headers: string[] = [];
    filteredData: any[] = [];
    queryText = 'Get the total revenue for all orders. Group by company and include the city.';
    phonePipe = new PhonePipe();
    subscription = new Subscription();
    @Output() customerSelected = new EventEmitter<any>();

    dialog = inject(MatDialog);
    dataService = inject(DataService);
    sorterService = inject(SorterService);
    eventBus = inject(EventBusService);
    featureFlags = inject(FeatureFlagsService);

    ngOnInit() {
        this.getData();
     }

    getData() {
        this.subscription.add(
            this.dataService.getCustomers().subscribe((data: any[]) => this.data = this.filteredData = data)
        );
    }

    filter(val: string) {
        const data = this.dataService.filter(val, this.data);
        this.filteredData = data ?? this.data;
    }

    getQueryData() {
        this.subscription.add(
            this.dataService.generateSql(this.queryText).subscribe((data: any) => {
                this.data = data;
            })
        );
    }

    reset() {
        this.getData();
    }

    sort(prop: string) {
        this.sorterService.sort(this.filteredData, prop);
    }

    sortDirection(prop: string): 'ascending' | 'descending' | 'none' {
        if (this.sorterService.property !== prop) return 'none';
        return this.sorterService.direction === 1 ? 'ascending' : 'descending';
    }

    getRelatedData(data: any) {
        this.customerSelected.emit(data);
    }

    openCallDialog(data: Phone) {
        this.eventBus.emit({ name: Events.CustomerCall, value: data });
    }

    openEmailSmsDialog(data: any) {
        if (data.phone && data.email) {
            // Create the data for the dialog
            let dialogData: EmailSmsDialogData = {
                prompt: '',
                title: `Contact ${data.company}`,
                company: data.company,
                customerName: data.first_name + ' ' + data.last_name,
                customerEmailAddress: data.email,
                customerPhoneNumber: data.phone
            }

            // Open the dialog
            const dialogRef = this.dialog.open(EmailSmsDialogComponent, {
                data: dialogData,
                width: '1000px',
                maxWidth: 'calc(100vw - 24px)'
            });

            // Subscribe to the dialog afterClosed observable to get the dialog result
            this.subscription.add(
                dialogRef.afterClosed().subscribe((response: EmailSmsDialogData) => {
                    console.log('SMS dialog result:', response);
                    if (response) {
                        dialogData = response;
                    }
                })
            );
        }
        else {
            alert('No phone number available.');
        }
    }

    ngOnDestroy() {
        this.subscription.unsubscribe();
    }
}
