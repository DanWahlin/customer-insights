
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
      // Clear the previous customer's results immediately without emitting a
      // completion event for the new request.
      this._data = [];
      //if (value) {
        this.search(value as string);
      //}
    }

    abstract search(searchText: string) : Promise<any>;

    protected async updateWithLatest<T>(loader: () => Promise<T[]>, errorMessage: string): Promise<void> {
      const generation = ++this.searchGeneration;
      try {
        const results = await loader();
        if (generation === this.searchGeneration) this.data = results;
      }
      catch (error) {
        console.error(errorMessage, error);
        if (generation === this.searchGeneration) {
          this.data = [];
          this.loadError.emit(errorMessage);
        }
      }
    }
}