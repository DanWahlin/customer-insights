import { ChangeDetectionStrategy, Component, inject, OnDestroy } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Subscription } from 'rxjs';
import { RelatedContentBaseComponent } from '@shared/related-content-base.component';
import { TeamsDialogData } from '../textarea-dialog/dialog-data';
import { TextAreaDialogComponent } from '../textarea-dialog/textarea-dialog.component';

@Component({
  selector: 'app-chats',
  templateUrl: './chats.component.html',
  styleUrls: ['./chats.component.scss'],
  imports: [MatButtonModule, MatCardModule],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class ChatsComponent extends RelatedContentBaseComponent implements OnDestroy {
  subscription = new Subscription();
  dialog = inject(MatDialog);
  dialogData: TeamsDialogData = {
    id: '',
    teamId: '',
    channelId: '',
    message: '',
    webUrl: '',
    title: 'Send Teams Chat',
    action: message => this.graphService.sendTeamsChat(message)
  };

  openDialog() {
    this.dialogData.message = this.searchText;
    const dialogRef = this.dialog.open(TextAreaDialogComponent, { data: this.dialogData });
    this.subscription.add(dialogRef.afterClosed().subscribe(response => {
      if (response) {
        this.dialogData = response;
        this.search(this.searchText);
      }
    }));
  }

  override async search(query: string) {
    this.data = await this.graphService.searchChatMessages(query);
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
}
