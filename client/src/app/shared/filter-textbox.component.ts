import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-filter-textbox',
    template: `
        <mat-form-field appearance="outline" class="filter-field" subscriptSizing="dynamic">
            <mat-label>{{ label }}</mat-label>
            <mat-icon matPrefix aria-hidden="true">search</mat-icon>
            <input matInput type="search" [(ngModel)]="filter" [attr.aria-label]="label" />
            @if (filter) {
                <button mat-icon-button matSuffix type="button" (click)="clear()" [attr.aria-label]="'Clear ' + label.toLowerCase()">
                    <mat-icon>close</mat-icon>
                </button>
            }
        </mat-form-field>
    `,
    styles: [`
        :host { display: block; width: min(100%, 360px); }
        .filter-field { width: 100%; }
        mat-icon { line-height: 1; }
    `],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatButtonModule]
})
export class FilterTextboxComponent {
    @Input() label = 'Search customers';

    private _filter = '';
    @Input() get filter() {
        return this._filter;
    }

    set filter(val: string) {
        this._filter = val;
        this.changed.emit(this.filter);
    }

    @Output() changed = new EventEmitter<string>();

    clear() {
        this.filter = '';
    }
}
