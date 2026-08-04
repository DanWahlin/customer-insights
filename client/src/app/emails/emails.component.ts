import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RelatedContentBaseComponent } from '@shared/related-content-base.component';

@Component({
  selector: 'app-emails',
  templateUrl: './emails.component.html',
  styleUrls: ['./emails.component.scss'],
  imports: [MatCardModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class EmailsComponent extends RelatedContentBaseComponent {
  override async search(query: string) {
    this.data = await this.graphService.searchEmailMessages(query);
  }
}
