import { Injectable, inject } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { ApiUrlService } from './api-url.service';
import { GraphService } from './graph.service';

@Injectable({ providedIn: 'root' })
export class ApiAuthenticationInterceptor implements HttpInterceptor {
  private readonly apiUrlService = inject(ApiUrlService);
  private readonly graphService = inject(GraphService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.isProtectedApiRequest(req.url)) return next.handle(req);

    return from(this.graphService.getApiAccessToken()).pipe(
      switchMap(accessToken => next.handle(req.clone({
        setHeaders: { Authorization: `Bearer ${accessToken}` }
      })))
    );
  }

  private isProtectedApiRequest(requestUrl: string): boolean {
    const apiBase = new URL(this.apiUrlService.getApiUrl(), window.location.origin);
    const target = new URL(requestUrl, window.location.origin);
    const basePath = apiBase.pathname.endsWith('/') ? apiBase.pathname : `${apiBase.pathname}/`;

    return target.origin === apiBase.origin &&
      target.pathname.startsWith(basePath) &&
      target.pathname !== `${basePath}health`;
  }
}
