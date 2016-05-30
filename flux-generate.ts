import * as rs from './reactivestreams-spec'
import * as sp from './subscription';
import * as flow from './flow';

export class GenerateSubscription<T, S> implements rs.Subscription, rs.Subscriber<T> {
    
    private requested: number = 0;

    private cancelled: boolean = false;
    
    private done : boolean = false;
    
    private hasValue : boolean = false;
    
    constructor(private actual: rs.Subscriber<T>,            
            private state: S, 
            private generator: (state: S, out: rs.Subscriber<T>) => S, 
            private stateDisposer: (state: S) => void) {
        
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            const r = this.requested;
            this.requested = r + n;
            if (r == 0) {
                this.drain(n);
            }
        }
    }
    
    cancel() : void {
        if (!this.cancelled) {
            this.cancelled = true;
            if (this.requested++ == 0) {
                this.clear();
            }
        }
    }
    
    clear() : void {
        try {
            this.stateDisposer(this.state);
        } catch (ex) {
            console.log(ex);
        }
    }
    
    drain(r: number) : void {
        var state : S = this.state;
        
        for (;;) {
            var e = 0;
            
            while (e != r) {
                if (this.cancelled) {
                    this.clear();
                    return;
                }
                
                this.hasValue = false;
                
                state = this.generator(state, this);              
                
                if (this.done) {
                    this.clear();
                    return;
                }
                
                e++;
            }
            
            if (e == r) {
                if (this.cancelled) {
                    this.clear();
                    return;
                }
            }
            
            if (e != 0) {
                r = this.requested - e;
                this.requested = r;
                if (r == 0) {
                    this.state = state;
                    break;
                }
            }
            
        }
    }
    
    onSubscribe(s: rs.Subscription) : void {
        // NO op
    }
    
    onNext(t: T) : void {
        if (this.hasValue) {
            this.onError(new Error("More than one value has been generated"));            
        } else {
            this.hasValue = true;
            this.actual.onNext(t);
        }
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        this.actual.onError(t);
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.actual.onComplete();
    }
}