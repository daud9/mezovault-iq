export interface ReadFlight {
  readonly context: string;
  readonly id: number;
}

/** Coordinates one current read per context while allowing newer contexts to supersede it. */
export class ReadFlightCoordinator {
  private active: ReadFlight | null = null;
  private nextId = 0;

  isActive(context: string): boolean {
    return this.active?.context === context;
  }

  isCurrent(flight: ReadFlight): boolean {
    return this.active === flight;
  }

  /** Returns null when this context already has a valid read in progress. */
  begin(context: string): ReadFlight | null {
    if (this.isActive(context)) return null;
    const flight = { context, id: ++this.nextId };
    this.active = flight;
    return flight;
  }

  finish(flight: ReadFlight): void {
    if (this.isCurrent(flight)) this.active = null;
  }

  cancel(flight: ReadFlight): void {
    this.finish(flight);
  }

  cancelContext(context: string): void {
    if (this.isActive(context)) this.active = null;
  }
}
