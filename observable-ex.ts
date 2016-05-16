import * as flow from './flow';
import * as os from './observable-spec';
import * as obs from './observer-ex';

export abstract class Ox<T> implements os.Observable<T> {
    abstract subscribe(s: os.Observer<T>) : void;
    
    // -------------------------------------------
    
    static range(start: number, count: number) : Ox<number> {
        return new OxRange(start, count);
    }
    
    // -------------------------------------------
    
    consume(onNext: (t: T) => void, onError?: (t: Error) => void, onComplete? : () => void) : flow.Cancellation {
        const cs = new obs.CallbackObserver(
            onNext, 
            onError === undefined ? (t: Error) : void => { console.log(t); } : onError,
            onComplete === undefined ? () : void => { } : onComplete);
        this.subscribe(cs);
        return cs;
    }
}

class OxRange extends Ox<number> {
    private mEnd: number;
    constructor(private start: number, count: number) {
        super();
        this.mEnd = start + count;
    }
    
    subscribe(s: os.Observer<number>) : void {
        var bc = new flow.BooleanCancellation();
        s.onSubscribe(bc);
        
        for (var i = this.start; i != this.mEnd; i++) {
            if (bc.isCancelled()) {
                return;
            }
            s.onNext(i);
        }
        if (bc.isCancelled()) {
            return;
        }
        s.onComplete();
    }
}