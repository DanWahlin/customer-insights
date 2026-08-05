import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { Customer, FoundryIQAnswer } from '@shared/interfaces';
import { EmailSmsCompletion } from '@shared/interfaces';
import { ApiUrlService } from './api-url.service';
import { SKIP_GLOBAL_OVERLAY } from './overlay/overlay-http-context';

@Injectable({ providedIn: 'root' })
export class DataService {

  apiUrlService = inject(ApiUrlService);
  http = inject(HttpClient);

  apiUrl = this.apiUrlService.getApiUrl();

  getCustomers(): Observable<Customer[]> {
    return this.http.get<Customer[]>(this.apiUrl + 'customers')
      .pipe(
        map(data => {
          // Sort by name
          return data.sort((a: Customer, b: Customer) => {
            if (a.company < b.company) {
              return -1;
            }
            if (a.company > b.company) {
              return 1;
            }
            return 0;
          });
        }),
        catchError(this.handleError)
      );

  }


  generateSql(prompt: string): Observable<any> {
    return this.http.post<any>(this.apiUrl + 'generateSql', { prompt })
      .pipe(
        catchError(this.handleError)
      );
  }

  askFoundryIQ(prompt: string): Observable<FoundryIQAnswer> {
    const context = new HttpContext().set(SKIP_GLOBAL_OVERLAY, true);
    return this.http.post<FoundryIQAnswer>(this.apiUrl + 'foundryIq', { prompt }, { context })
      .pipe(
        catchError(this.handleError)
      );
  }

  completeEmailSmsMessages(prompt: string, company: string, contactName: string): Observable<EmailSmsCompletion> {
    const context = new HttpContext().set(SKIP_GLOBAL_OVERLAY, true);
    return this.http.post<EmailSmsCompletion>(
      this.apiUrl + 'completeEmailSmsMessages',
      { prompt, company, contactName },
      { context }
    )
      .pipe(
        catchError(this.handleError)
      );
  }

  filter(val: string, data: any[]) {
    if (val) {
      val = val.toLowerCase();
      const filteredData = data.filter((data: any) => {
        for (const property in data) {
          const propValue = data ? data[property].toString().toLowerCase() : '';
          if (propValue && propValue.indexOf(val) > -1) {
            return true;
          }
        }
        return false;
      });
      return filteredData;
    } else {
      return null;
    }
  }

  private handleError(error: HttpErrorResponse) {
    console.error('server error:', error);
    if (error.error instanceof Error) {
      const errMessage = error.error.message;
      return throwError(() => errMessage);
      // Use the following instead if using lite-server
      // return Observable.throw(err.text() || 'backend server error');
    }
    return throwError(() => error || 'Node.js server error');
  }

}