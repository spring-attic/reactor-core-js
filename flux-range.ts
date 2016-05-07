import * as rs from './reactivestreams-spec';
import * as flow from './flow';
import * as sp from './subscription'

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
            const f = this.mEnd;
            const a = this.mActual;
            var i = this.mIndex;

            if (n >= f - i) {
                for ( ; i != f; i++) {
                    if (this.cancelled) {
                        return;
                    }
                    a.onNext(i);
                }
                if (!this.cancelled) {
                    a.onComplete();
                }
                return;
            }            
            r = n;
            var e = 0;
            
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

export class FluxArraySubscription<T> implements flow.QueueSubscription<T> {
    private mActual: rs.Subscriber<T>;
    private mArray: Array<T>;
    private mIndex: number;
    private requested: number;
    private cancelled: boolean;
    
    constructor(array: Array<T>, actual: rs.Subscriber<T>) {
        this.mActual = actual;
        this.mArray = array;
        this.mIndex = 0;
        this.requested = 0;
        this.cancelled = false; 
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            var r = this.requested;
            this.requested = r + n;
            if (r != 0) {
                return;
            }
            
            r = n;
            var e = 0;
            var i = this.mIndex;
            const b = this.mArray;
            const f = b.length;
            const a = this.mActual;
            
            for (;;) {
                if (this.cancelled) {
                    return;
                }

                while (e != r && i != f) {
                    const v = b[i];
                    
                    if (v == null) {
                        a.onError(new Error("The " + i + "th element was null"));
                        return;
                    }
                    
                    a.onNext(v);

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
    
    offer(t: T) : boolean {
        throw flow.FC.unsupported();
    }
    
    poll() : T {
        const i = this.mIndex;
        const b = this.mArray;
        if (i == b.length) {
            return null;
        }
        this.mIndex = i + 1;
        const v = b[i];
        if (v == null) {
            throw new Error("The " + i + "th element was null");
        }
        return v;
    }
    
    isEmpty() : boolean {
        return this.mArray.length == this.mIndex;
    }
    
    size() : number {
        return this.mArray.length - this.mIndex;
    }
    
    clear() {
        this.mIndex = this.mArray.length;
    }
} 