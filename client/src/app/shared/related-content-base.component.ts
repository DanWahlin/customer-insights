
import { Component, EventEmitter, Input, Output, inject, ChangeDetectionStrategy } from "@angular/core";
import { GraphService } from "@core/graph.service";

@Component({
    template: ``,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: true
})
export abstract class RelatedContentBaseComponent {
    graphService: GraphService = inject(GraphService);
    private searchGeneration = 0;
    
    @Output()
    dataLoaded: EventEmitter<any> = new EventEmitter();
    @Output()
    loadError = new EventEmitter<string>();

    private _data: any[] = [];
    @Input() get data(): any[] {
      return this._data;
    }

    set data(value: any[]) {
      this._data = value;
      this.dataLoaded.emit(value);
    }

    private _searchText = '';
    @Input() get searchText(): string {
      return this._searchText;
    }
  
    set searchText(value: string) {
      this._searchText = value;
      //if (value) {
        this.search(value as string);
      //}
    }

    abstract search(searchText: string) : Promise<any>;

    protected async updateWithLatest<T>(loader: () => Promise<T[]>): Promise<void> {
      const generation = ++this.searchGeneration;
      try {
        const results = await loader();
        if (generation === this.searchGeneration) this.data = results;
      }
      catch {
        if (generation === this.searchGeneration) {
          this.loadError.emit('Microsoft 365 content could not be loaded. Try again or use another search term.');
        }
      }
    }
}