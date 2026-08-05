import { ApplicationRef, Component, ComponentRef, EnvironmentInjector, OnDestroy, OnInit, createComponent, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DomSanitizer } from '@angular/platform-browser';
import { FeatureFlagsService } from '@core/feature-flags.service';
import { GraphService } from '@core/graph.service';
import { Customer } from './shared/interfaces';
import { PEOPLE_ICON, FILE_ICON, CHAT_ICON, EMAIL_ICON, AGENDA_ICON, PHONE_ICON, CONTENT_ICON, SEARCH_ICON, RESET_ICON, CONTACT_ICON, SMS_ICON } from '@shared/svg-icons';
import { RouterOutlet } from '@angular/router';
import { OverlayComponent } from './core/overlay/overlay.component';
import { RelatedContentComponent } from './related-content/related-content.component';
import { CustomersListComponent } from './customers-list/customers-list.component';
import { HeaderComponent } from './header/header.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subscription } from 'rxjs';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [HeaderComponent, CustomersListComponent, OverlayComponent, RouterOutlet, MatButtonModule, MatIconModule,
      MatProgressSpinnerModule]
})
export class AppComponent implements OnInit, OnDestroy {
  get loggedIn() {
    return this.graphService.loggedIn();
  }
  name = '';
  signInMessage = '';
  selectedCustomer: Customer | null = null;
  relatedContentLoading = false;
  relatedContentLoadError = '';
  timer: ReturnType<typeof setTimeout> | null = null;
  iconList = [ 
    { name: 'people', icon: PEOPLE_ICON }, 
    { name: 'file', icon: FILE_ICON }, 
    { name: 'chat', icon: CHAT_ICON },
    { name: 'email', icon: EMAIL_ICON }, 
    { name: 'agenda', icon: AGENDA_ICON }, 
    { name: 'phone', icon: PHONE_ICON },
    { name: 'content', icon: CONTENT_ICON }, 
    { name: 'search', icon: SEARCH_ICON },
    { name: 'reset', icon: RESET_ICON }, 
    { name: 'contact', icon: CONTACT_ICON }, 
    { name: 'sms', icon: SMS_ICON }

  ];
  relatedContentComponentRef?: ComponentRef<RelatedContentComponent>;
  relatedContentSubscription?: Subscription;

  injector = inject(EnvironmentInjector);
  appRef = inject(ApplicationRef);
  graphService = inject(GraphService);
  iconRegistry = inject(MatIconRegistry);
  sanitizer = inject(DomSanitizer);
  featureFlags = inject(FeatureFlagsService);


  async ngOnInit() {
    for (const item of this.iconList) {
      this.iconRegistry.addSvgIconLiteral(item.name, this.sanitizer.bypassSecurityTrustHtml(item.icon));
    }
    const user = await this.graphService.init();
    if (user?.displayName) {
      this.name = user.displayName;
    }

    // Update the signInMessage property after 800ms
    // Option 1: of('Please sign in to continue').pipe(delay(800)).subscribe((msg: string) => this.signInMessage = msg);
    // Option 2 (yes...opting for simplicity):
    this.timer = setTimeout(() => this.signInMessage = 'Please sign in to continue', 800);
  }

  async customerSelected(customer: Customer) {
    this.selectedCustomer = { ...customer };
    this.relatedContentLoading = true;
    this.relatedContentLoadError = '';
    try {
      await this.loadRelatedContentComponent();
    }
    catch {
      this.relatedContentLoading = false;
      this.relatedContentLoadError = 'The Microsoft 365 workspace could not be opened. Please try again.';
    }
  }

  async loadRelatedContentComponent() {
    if (!this.relatedContentComponentRef) {
      const { RelatedContentComponent } = await import('./related-content/related-content.component');
      this.relatedContentComponentRef = createComponent(RelatedContentComponent, { 
        hostElement: document.getElementById('related-content')!, 
        environmentInjector: this.injector 
      });
      this.appRef.attachView(this.relatedContentComponentRef.hostView);
      this.relatedContentSubscription = this.relatedContentComponentRef.instance.contentLoaded.subscribe(company => {
        if (company === this.selectedCustomer?.company) {
          this.relatedContentLoading = false;
        }
      });
    }

    this.relatedContentComponentRef.setInput('selectedCustomer', this.selectedCustomer);
    this.relatedContentComponentRef.changeDetectorRef.detectChanges();
    this.scrollRelatedContentIntoView();
  }

  private scrollRelatedContentIntoView() {
    requestAnimationFrame(() => {
      const region = document.getElementById('related-content-region');
      if (!region) return;

      const bounds = region.getBoundingClientRect();
      const alreadyVisible = bounds.top >= 76 && bounds.top < window.innerHeight * .72;
      if (!alreadyVisible) {
        region.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  userLoggedIn(user: { displayName?: string | null }) {
    this.name = user.displayName ?? '';
  }

  async login() {
    const user = await this.graphService.login();
    this.name = user.displayName ?? '';
  }

  ngOnDestroy() {
    this.relatedContentSubscription?.unsubscribe();
    if (this.relatedContentComponentRef) {
      this.appRef.detachView(this.relatedContentComponentRef.hostView);
      this.relatedContentComponentRef.destroy();
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }
}
