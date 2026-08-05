import { importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { AppComponent } from './app/app.component';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { withInterceptorsFromDi, provideHttpClient, HTTP_INTERCEPTORS, withXhr } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { provideAnimations } from '@angular/platform-browser/animations';
import { BrowserModule, bootstrapApplication } from '@angular/platform-browser';
import { PhonePipe } from '@shared/phone.pipe';
import { CurrencyPipe, DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { OverlayRequestResponseInterceptor } from '@core/overlay/overlay-request-response.interceptor';
import { ApiAuthenticationInterceptor } from '@core/api-authentication.interceptor';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

function isAuthenticationResponse(): boolean {
  const response = `${window.location.search}&${window.location.hash}`;
  const isPopup = Boolean(window.opener && window.opener !== window);
  return isPopup && /(?:^|[?&#])(code|error|error_description|state)=/i.test(response);
}

if (isAuthenticationResponse()) {
  broadcastResponseToMainFrame().catch(error => console.error('Microsoft authentication callback failed:', error));
} else {
  bootstrapApplication(AppComponent, {
    providers: [
        provideZoneChangeDetection(),
        importProvidersFrom(BrowserModule, FormsModule, MatBadgeModule, MatButtonModule, MatCardModule,
          MatDialogModule, MatExpansionModule, MatMenuModule, MatTabsModule, MatToolbarModule, MatIconModule),
        CurrencyPipe, DatePipe, DecimalPipe, PhonePipe, TitleCasePipe,
        provideAnimations(),
        provideHttpClient(withXhr(), withInterceptorsFromDi()),
        {
          provide: HTTP_INTERCEPTORS,
          useClass: OverlayRequestResponseInterceptor,
          multi: true,
        },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ApiAuthenticationInterceptor,
          multi: true,
        }
    ]
    })
    .catch(err => console.error(err));
}
