import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RelatedContentBaseComponent } from '@shared/related-content-base.component';

@Component({
  selector: 'app-files',
  templateUrl: './files.component.html',
  styleUrls: ['./files.component.scss'],
  standalone: true,
  imports: [MatCardModule, MatButtonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class FilesComponent extends RelatedContentBaseComponent {
  override async search(query: string) {
    await this.updateWithLatest(() => this.graphService.searchFiles(query));
  }
}
