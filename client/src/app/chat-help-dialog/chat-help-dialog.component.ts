import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DataService } from '@core/data.service';
import { FoundryIQAnswer } from '@shared/interfaces';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-chat-help-dialog',
  templateUrl: './chat-help-dialog.component.html',
  styleUrls: ['./chat-help-dialog.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule,
    MatFormFieldModule, MatInputModule]
})
export class ChatHelpDialogComponent {
  prompt = 'What supplies are associated with Adventure Works Cycles?';
  placeholder = 'Ask a question about the indexed customer documents';
  result: FoundryIQAnswer | null = null;
  error = '';
  loading = false;
  dataService = inject(DataService);

  getHelp() {
    const question = this.prompt.trim();
    if (!question || this.loading) return;

    this.loading = true;
    this.error = '';
    this.result = null;
    this.dataService.askFoundryIQ(question).subscribe({
      next: result => {
        this.result = result;
        this.loading = false;
      },
      error: error => {
        this.error = error?.error?.error ?? error?.message ?? 'Foundry IQ could not answer the question.';
        this.loading = false;
      }
    });
  }
}
