import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RelatedContentBaseComponent } from '@shared/related-content-base.component';

type CalendarEvent = {
  isAllDay?: boolean;
  start?: { dateTime?: string | null };
  end?: { dateTime?: string | null };
};

@Component({
  selector: 'app-calendar-events',
  templateUrl: './calendar-events.component.html',
  styleUrls: ['./calendar-events.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager
})
export class CalendarEventsComponent extends RelatedContentBaseComponent {
  override async search(query: string) {
    this.data = await this.graphService.searchCalendarEvents(query);
  }

  dayFromDateTime(dateTimeString: string) {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(this.parseUtcDateTime(dateTimeString));
  }

  timeRangeFromEvent(event: CalendarEvent) {
    if (event.isAllDay) return 'ALL DAY';
    if (!event.start?.dateTime || !event.end?.dateTime) return '';

    const format = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${format.format(this.parseUtcDateTime(event.start.dateTime))} - ${format.format(this.parseUtcDateTime(event.end.dateTime))}`;
  }

  private parseUtcDateTime(dateTimeString: string): Date {
    const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(dateTimeString);
    return new Date(hasOffset ? dateTimeString : `${dateTimeString}Z`);
  }
}
