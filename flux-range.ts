import * as rs from './reactivestreams-spec';
import * as flow from './flow';

export class FluxRangeSubscription implements flow.QueueSubscription<number> {
    private mActual : rs.Subscriber<number>;
    private mEnd : number;
    private requested : number;
    private mIndex : number;
    private cancelled : boolean;
    
    constructor(start: number, end: number, actual: rs.Subscriber<number>) {
        this.mActual = actual;
        this.mIndex = start;
        this.mEnd = end;
        this.requested = 0;
        this.cancelled = false;
    }
    
    request(n : number) : void {
        if (n <= 0) {
            throw new Error("n > 0 required but it was " + n);
        }
        var r = this.requested;
        this.requested = r + n;
        
        if (r == 0) {
            r = n;
            var e = 0;
            var i = this.mIndex;
            const f = this.mEnd;
            const a = this.mActual;
            
            for (;;) {
                if (this.cancelled) {
                    return;
                }

                while (e != r && i != f) {
                    a.onNext(i);

                    if (this.cancelled) {
                        return;
                    }

                    i++;
                    e++;                    
                }

                if (this.cancelled) {
                    return;
                }
                
                if (i == f) {
                    a.onComplete();
                    return;
                }
                
                n = this.requested;
                if (r == n) {
                    this.requested = 0;
                    return;
                } else {
                    r = n;
                }
                
            }
        }
    }
    
    cancel() : void {
        this.cancelled = true;
    }
    
    requestFusion(mode: number) : number {
        if ((mode & flow.FC.SYNC) != 0) {
            return flow.FC.SYNC;
        }
        return flow.FC.NONE;
    }
    
    offer(t: number) : boolean {
        throw flow.FC.unsupported();
    }
    
    poll() : number {
        const index = this.mIndex;
        if (index == this.mEnd) {
            return null;
        }
        this.mIndex = index + 1;
        return index;
    }
    
    isEmpty() : boolean {
        return this.mIndex == this.mEnd;
    }
    
    size() : number {
        return this.mEnd - this.mIndex;
    }
    
    clear() {
        this.mIndex = this.mEnd;
    }
}