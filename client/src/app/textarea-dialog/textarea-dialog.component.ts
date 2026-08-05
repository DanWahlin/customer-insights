import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { DataService } from '@core/data.service';
import { DialogBase, TeamsDialogData } from './dialog-data';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-textarea-dialog',
    templateUrl: './textarea-dialog.component.html',
    styleUrls: ['./textarea-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [MatDialogModule, MatIconModule, FormsModule, MatButtonModule]
})
export class TextAreaDialogComponent implements OnInit {
  title = '';
  message = '';
  initialMessage = '';
  error = '';
  sending = false;

  dialogRef = inject(MatDialogRef<TextAreaDialogComponent>);
  dataService = inject(DataService);
  data: DialogBase | TeamsDialogData = inject(MAT_DIALOG_DATA);

  ngOnInit() {
    this.title = this.data instanceof Error ? '' : this.data.title;
    this.message = this.data instanceof Error ? '' : this.data.message;
  }

  async send() {
    if (this.data.action && !this.sending) {
      this.sending = true;
      try {
        this.error = '';
        this.data = await this.data.action(this.message);
        this.dialogRef.close(this.data);
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'The Teams message could not be sent.';
      } finally {
        this.sending = false;
      }
    }
  }

}
